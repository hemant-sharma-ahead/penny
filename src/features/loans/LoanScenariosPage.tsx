import { useState, useMemo, useRef, useEffect } from 'react';
import { utils, writeFile } from 'xlsx';
import { usePrivacy } from '@/context/PrivacyContext';
import type { Liability, LiabilityType } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { calcAmortization, deriveTenureMonths } from '@/core/loans/amortization';
import type { LoanPlanParams } from '@/core/loans/amortization';
import { calcEmi } from '@/core/loans/calculator';
import { useLoans, EMI_LOAN_TYPES } from './useLoans';

// ── Constants ────────────────────────────────────────────────────────────────

const LOAN_META: Record<string, { label: string; icon: string; color: string }> = {
  home_loan: { label: 'Home Loan', icon: 'ti-home', color: '#6366f1' },
  car_loan: { label: 'Car Loan', icon: 'ti-car', color: '#3b82f6' },
  personal_loan: { label: 'Personal Loan', icon: 'ti-user', color: '#f59e0b' },
  education_loan: { label: 'Education Loan', icon: 'ti-school', color: '#10b981' },
  gold_loan: { label: 'Gold Loan', icon: 'ti-coin', color: '#d97706' },
  lap: { label: 'Loan Against Property', icon: 'ti-building', color: '#8b5cf6' }
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtMonths(m: number): string {
  const y = Math.floor(m / 12);
  const mo = m % 12;
  if (y === 0) return `${mo}m`;
  if (mo === 0) return `${y}y`;
  return `${y}y ${mo}m`;
}

function num(s: string): number {
  return parseFloat(s) || 0;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">{children}</p>;
}

interface FieldProps {
  label?: string;
  prefix?: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}
function Field({ label, prefix, suffix, value, onChange, placeholder, hint }: FieldProps) {
  return (
    <div>
      {label !== undefined && (
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-xs font-medium text-secondary">{label}</span>
          {hint && <span className="text-[10px] text-tertiary">{hint}</span>}
        </div>
      )}
      <div className="flex items-center rounded-xl border border-theme bg-surface-2 overflow-hidden">
        {prefix && <span className="pl-3 text-sm text-tertiary select-none">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent px-3 py-2.5 text-sm text-primary focus:outline-none min-w-0"
        />
        {suffix && <span className="pr-3 text-sm text-tertiary select-none">{suffix}</span>}
      </div>
    </div>
  );
}

interface CompareRowProps {
  label: string;
  original: string;
  withPlan: string;
  saving?: boolean;
}
function CompareRow({ label, original, withPlan, saving }: CompareRowProps) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-theme last:border-0">
      <span className="flex-1 text-xs text-secondary">{label}</span>
      <span className="w-24 text-right text-xs font-medium text-primary">{original}</span>
      <span
        className="w-24 text-right text-xs font-semibold"
        style={{ color: saving ? '#10b981' : 'var(--color-primary)' }}
      >
        {withPlan}
      </span>
    </div>
  );
}

interface SelectOption {
  label: string;
  value: number;
}
interface CustomSelectProps {
  value: number;
  onChange: (v: number) => void;
  options: SelectOption[];
  className?: string;
}
function CustomSelect({ value, onChange, options, className }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between input-surface rounded-xl border px-3 py-2.5 text-xs focus:outline-none"
      >
        <span className="text-primary">{selected?.label}</span>
        <i className="ti ti-chevron-down text-tertiary" style={{ fontSize: 11 }} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="absolute top-full left-0 right-0 mt-1 rounded-xl border border-theme shadow-lg overflow-hidden z-10"
          style={{ backgroundColor: 'var(--color-surface)', maxHeight: 200, overflowY: 'auto' }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-xs"
              style={
                o.value === value
                  ? {
                      color: 'var(--color-primary)',
                      fontWeight: 600,
                      backgroundColor: 'var(--color-surface-secondary)'
                    }
                  : { color: 'var(--color-text-primary)' }
              }
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function LoanScenariosPage() {
  const { mode } = usePrivacy();
  const { saveLiability, emiLoans } = useLoans();

  // UI state
  const [activeTab, setActiveTab] = useState<'myloans' | 'planner'>('myloans');

  // ── Planner state ──
  const now = new Date();
  const [principal, setPrincipal] = useState('');
  const [rate, setRate] = useState('');
  const [tenureYrs, setTenureYrs] = useState('');
  const [tenureMos, setTenureMos] = useState('');
  const [startYear, setStartYear] = useState(now.getFullYear());
  const [startMonth, setStartMonth] = useState(now.getMonth());
  const [stepUp, setStepUp] = useState('0');
  const [extraEmi, setExtraEmi] = useState('0');
  const [strategy, setStrategy] = useState<'reduce_tenure' | 'reduce_emi'>('reduce_tenure');
  const [prepayRows, setPrepayRows] = useState<{ id: string; month: string; amount: string }[]>([]);

  // ── Add Loan form state ──
  const [showAddLoan, setShowAddLoan] = useState(false);
  const [formType, setFormType] = useState<LiabilityType>('home_loan');
  const [formName, setFormName] = useState('');
  const [formLender, setFormLender] = useState('');
  const [formOutstanding, setFormOutstanding] = useState('');
  const [formRate, setFormRate] = useState('');
  const [formTenureYrs, setFormTenureYrs] = useState('');
  const [formTenureMos, setFormTenureMos] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  const formTenureTotal = num(formTenureYrs) * 12 + num(formTenureMos);
  const computedEmi =
    formTenureTotal > 0 && num(formOutstanding) > 0 && num(formRate) > 0
      ? calcEmi(num(formOutstanding), num(formRate), formTenureTotal)
      : null;

  function openAddLoan() {
    setFormType('home_loan');
    setFormName('');
    setFormLender('');
    setFormOutstanding('');
    setFormRate('');
    setFormTenureYrs('');
    setFormTenureMos('');
    setShowAddLoan(true);
  }

  function handleSaveLoan(id: string, ts: number) {
    if (!formName.trim() || !formOutstanding || !formRate || formSaving) return;
    setFormSaving(true);
    const loan: Liability = {
      id,
      type: formType,
      name: formName.trim(),
      lenderName: formLender.trim() || undefined,
      principalAmount: num(formOutstanding),
      outstandingAmount: num(formOutstanding),
      interestRate: num(formRate),
      emiAmount: computedEmi ?? undefined,
      createdAt: ts,
      updatedAt: ts
    };
    saveLiability(loan)
      .then(() => {
        setFormSaving(false);
        setShowAddLoan(false);
      })
      .catch(() => setFormSaving(false));
  }

  function prefillFromLoan(l: Liability) {
    setPrincipal(String(Math.round(l.outstandingAmount)));
    setRate(String(l.interestRate));
    if (l.emiAmount) {
      const t = deriveTenureMonths(l.outstandingAmount, l.interestRate, l.emiAmount);
      setTenureYrs(String(Math.floor(t / 12)));
      setTenureMos(String(t % 12));
    } else {
      setTenureYrs('');
      setTenureMos('');
    }
    setStartYear(now.getFullYear());
    setStartMonth(now.getMonth());
    setStepUp('0');
    setExtraEmi('0');
    setStrategy('reduce_tenure');
    setPrepayRows([]);
    setActiveTab('planner');
  }

  // ── Compute params ──
  const totalTenureMonths = num(tenureYrs) * 12 + num(tenureMos);

  const planParams = useMemo(
    (): LoanPlanParams => ({
      principal: num(principal),
      annualRatePct: num(rate),
      tenureMonths: totalTenureMonths,
      startYear,
      startMonth,
      stepUpPct: num(stepUp),
      extraEmiPerYear: Math.round(num(extraEmi)),
      prepayments: prepayRows
        .map((r) => ({ month: parseInt(r.month, 10), amount: num(r.amount) }))
        .filter((p) => p.month > 0 && p.amount > 0),
      strategy
    }),
    [principal, rate, totalTenureMonths, startYear, startMonth, stepUp, extraEmi, prepayRows, strategy]
  );

  const baseParams = useMemo(
    (): LoanPlanParams => ({ ...planParams, stepUpPct: 0, extraEmiPerYear: 0, prepayments: [] }),
    [planParams]
  );

  const result = useMemo(() => calcAmortization(planParams), [planParams]);
  const baseline = useMemo(() => calcAmortization(baseParams), [baseParams]);

  const isValid = planParams.principal > 0 && planParams.annualRatePct > 0 && planParams.tenureMonths > 0;
  const hasAccelerators =
    planParams.stepUpPct > 0 || planParams.extraEmiPerYear > 0 || planParams.prepayments.length > 0;
  const interestSaved = Math.max(0, baseline.totalInterest - result.totalInterest);
  const monthsSaved = Math.max(0, baseline.actualTenureMonths - result.actualTenureMonths);

  // ── XLSX download ──
  function downloadXlsx() {
    if (!isValid || result.rows.length === 0) return;

    const wb = utils.book_new();

    // Sheet 1: Summary
    const summaryData: (string | number)[][] = [
      ['Penny — Loan Planner Summary'],
      [],
      ['Loan Parameters'],
      ['Principal (₹)', planParams.principal],
      ['Interest Rate', `${planParams.annualRatePct}% p.a.`],
      ['Tenure', fmtMonths(planParams.tenureMonths)],
      ['Start Month', `${MONTHS[planParams.startMonth]} ${planParams.startYear}`],
      ['EMI Step-up', planParams.stepUpPct > 0 ? `${planParams.stepUpPct}% per year` : 'None'],
      ['Extra EMI / year', planParams.extraEmiPerYear > 0 ? `${planParams.extraEmiPerYear}` : 'None'],
      ['Prepayment Strategy', planParams.strategy === 'reduce_tenure' ? 'Reduce Tenure' : 'Reduce EMI'],
      [],
      ['Comparison', 'Original', 'With Plan', 'Saved'],
      ['Tenure', fmtMonths(baseline.actualTenureMonths), fmtMonths(result.actualTenureMonths), fmtMonths(monthsSaved)],
      [
        'Total Interest (₹)',
        Math.round(baseline.totalInterest),
        Math.round(result.totalInterest),
        Math.round(interestSaved)
      ],
      [
        'Total Paid (₹)',
        Math.round(baseline.totalEmiPaid),
        Math.round(result.totalEmiPaid + result.totalPrepayment),
        ''
      ],
      ['Total Prepayment (₹)', 0, Math.round(result.totalPrepayment), '']
    ];
    const ws1 = utils.aoa_to_sheet(summaryData);
    utils.book_append_sheet(wb, ws1, 'Summary');

    // Sheet 2: Amortization Schedule
    const header = [
      'Month',
      'Date',
      'Opening Balance (₹)',
      'EMI (₹)',
      'Principal (₹)',
      'Interest (₹)',
      'Prepayment (₹)',
      'Closing Balance (₹)'
    ];
    const schedData: (string | number)[][] = [
      header,
      ...result.rows.map((r) => [
        r.month,
        r.date,
        Math.round(r.openingBalance),
        Math.round(r.emi),
        Math.round(r.principal),
        Math.round(r.interest),
        r.prepayment > 0 ? Math.round(r.prepayment) : '',
        Math.round(r.closingBalance)
      ])
    ];
    const ws2 = utils.aoa_to_sheet(schedData);
    ws2['!cols'] = [
      { wch: 8 },
      { wch: 10 },
      { wch: 22 },
      { wch: 12 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 22 }
    ];
    utils.book_append_sheet(wb, ws2, 'Schedule');

    writeFile(wb, `penny-loan-${planParams.annualRatePct}pct-${planParams.tenureMonths}m.xlsx`);
  }

  // ── Prepayment helpers ──
  function addPrepayRow() {
    setPrepayRows((prev) => [...prev, { id: crypto.randomUUID(), month: '', amount: '' }]);
  }
  function updatePrepayRow(id: string, field: 'month' | 'amount', val: string) {
    setPrepayRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  }
  function removePrepayRow(id: string) {
    setPrepayRows((prev) => prev.filter((r) => r.id !== id));
  }

  const yearOptions = Array.from({ length: 8 }, (_, i) => now.getFullYear() - 1 + i);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-theme flex-shrink-0">
        <h2 className="text-xl font-semibold text-primary">Loans</h2>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1.5 px-4 py-2.5 border-b border-theme flex-shrink-0">
        {(['myloans', 'planner'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={
              activeTab === t
                ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                : { backgroundColor: 'var(--color-surface-secondary)', color: 'var(--color-text-secondary)' }
            }
          >
            {t === 'myloans' ? 'My Loans' : 'Planner'}
          </button>
        ))}
      </div>

      {/* ── My Loans tab ── */}
      {activeTab === 'myloans' && (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {emiLoans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <i className="ti ti-building-bank text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
              <p className="text-sm text-primary font-medium mt-3">No loans tracked yet</p>
              <p className="text-xs text-tertiary mt-1 max-w-[260px]">
                Track your home, car, or personal loans to plan repayment.
              </p>
              <button
                onClick={openAddLoan}
                className="mt-5 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                <i className="ti ti-plus" style={{ fontSize: 15 }} aria-hidden="true" />
                Add Loan
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <button
                onClick={openAddLoan}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-theme text-xs font-medium text-secondary"
              >
                <i className="ti ti-plus" style={{ fontSize: 13 }} aria-hidden="true" />
                Add Loan
              </button>
              {emiLoans.map((l: Liability) => {
                const meta = LOAN_META[l.type] ?? { label: l.type, icon: 'ti-coin', color: 'var(--color-primary)' };
                const monthsLeft = l.emiAmount
                  ? deriveTenureMonths(l.outstandingAmount, l.interestRate, l.emiAmount)
                  : l.endDate
                    ? Math.max(0, Math.round((l.endDate - now.getTime()) / (30.44 * 24 * 60 * 60 * 1000)))
                    : null;

                return (
                  <div key={l.id} className="surface rounded-2xl p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${meta.color}18` }}
                      >
                        <i
                          className={`ti ${meta.icon}`}
                          style={{ fontSize: 18, color: meta.color }}
                          aria-hidden="true"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-primary leading-tight">{l.name}</p>
                        {l.lenderName && <p className="text-xs text-tertiary mt-0.5">{l.lenderName}</p>}
                      </div>
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ backgroundColor: `${meta.color}18`, color: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mt-3">
                      <div>
                        <p className="text-[10px] text-tertiary">Outstanding</p>
                        <p className="text-sm font-semibold text-primary">
                          {mode === 'open' ? formatCurrency(l.outstandingAmount) : '••••'}
                        </p>
                      </div>
                      {l.emiAmount ? (
                        <div>
                          <p className="text-[10px] text-tertiary">EMI / month</p>
                          <p className="text-sm font-semibold text-primary">
                            {mode === 'open' ? formatCurrency(l.emiAmount) : '••••'}
                          </p>
                        </div>
                      ) : null}
                      <div>
                        <p className="text-[10px] text-tertiary">Rate</p>
                        <p className="text-sm font-semibold text-primary">{l.interestRate}% p.a.</p>
                      </div>
                    </div>

                    {monthsLeft !== null && (
                      <div className="mt-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] text-tertiary">Estimated remaining</p>
                          <p className="text-[10px] font-medium text-secondary">{fmtMonths(monthsLeft)}</p>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => prefillFromLoan(l)}
                      className="mt-3 w-full py-2 rounded-xl text-xs font-semibold border border-theme text-secondary flex items-center justify-center gap-1.5"
                    >
                      <i className="ti ti-calculator" style={{ fontSize: 13 }} aria-hidden="true" />
                      Plan this loan
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Planner tab ── */}
      {activeTab === 'planner' && (
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-4 flex flex-col gap-5">
            {/* Loan Basics */}
            <div>
              <SectionLabel>Loan Basics</SectionLabel>
              <div className="surface rounded-2xl p-4 flex flex-col gap-3">
                <Field
                  label="Principal"
                  prefix="₹"
                  value={principal}
                  onChange={setPrincipal}
                  placeholder="e.g. 5000000"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Interest rate" suffix="% p.a." value={rate} onChange={setRate} placeholder="8.5" />
                  <div>
                    <p className="text-xs font-medium text-secondary mb-1">Start month</p>
                    <div className="flex gap-1">
                      <CustomSelect
                        value={startMonth}
                        onChange={setStartMonth}
                        options={MONTHS.map((m, i) => ({ label: m, value: i }))}
                        className="flex-1"
                      />
                      <CustomSelect
                        value={startYear}
                        onChange={setStartYear}
                        options={yearOptions.map((y) => ({ label: String(y), value: y }))}
                        className="w-20"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-secondary mb-1">Tenure</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field suffix="years" value={tenureYrs} onChange={setTenureYrs} placeholder="20" />
                    <Field suffix="months" value={tenureMos} onChange={setTenureMos} placeholder="0" />
                  </div>
                </div>
              </div>
            </div>

            {/* Accelerators */}
            <div>
              <SectionLabel>Accelerators</SectionLabel>
              <div className="surface rounded-2xl p-4 flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="EMI step-up"
                    suffix="% / year"
                    value={stepUp}
                    onChange={setStepUp}
                    placeholder="0"
                    hint="0 = off"
                  />
                  <Field
                    label="Extra EMI"
                    suffix="/ year"
                    value={extraEmi}
                    onChange={setExtraEmi}
                    placeholder="0"
                    hint="0 = off"
                  />
                </div>
                <div>
                  <p className="text-xs font-medium text-secondary mb-1.5">Prepayment strategy</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['reduce_tenure', 'reduce_emi'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setStrategy(s)}
                        className="py-2 rounded-xl text-xs font-medium border transition-colors"
                        style={
                          strategy === s
                            ? {
                                backgroundColor: 'var(--color-primary)',
                                color: '#fff',
                                borderColor: 'var(--color-primary)'
                              }
                            : {
                                backgroundColor: 'var(--color-surface-secondary)',
                                color: 'var(--color-text-secondary)',
                                borderColor: 'var(--color-border)'
                              }
                        }
                      >
                        {s === 'reduce_tenure' ? 'Reduce tenure' : 'Reduce EMI'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Lump Sum Prepayments */}
            <div>
              <SectionLabel>Lump Sum Prepayments</SectionLabel>
              <div className="surface rounded-2xl p-4 flex flex-col gap-3">
                {prepayRows.length === 0 && (
                  <p className="text-xs text-tertiary text-center py-1">
                    No prepayments added. Add one-time lump sum payments below.
                  </p>
                )}
                {prepayRows.map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <div className="flex items-center flex-1 rounded-xl border border-theme bg-surface-2 overflow-hidden">
                      <span className="pl-3 text-xs text-tertiary whitespace-nowrap">Month</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={r.month}
                        onChange={(e) => updatePrepayRow(r.id, 'month', e.target.value)}
                        placeholder="e.g. 12"
                        className="w-14 bg-transparent px-2 py-2.5 text-sm text-primary focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center flex-1 rounded-xl border border-theme bg-surface-2 overflow-hidden">
                      <span className="pl-3 text-xs text-tertiary">₹</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={r.amount}
                        onChange={(e) => updatePrepayRow(r.id, 'amount', e.target.value)}
                        placeholder="Amount"
                        className="flex-1 bg-transparent px-2 py-2.5 text-sm text-primary focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={() => removePrepayRow(r.id)}
                      className="w-9 h-9 flex items-center justify-center rounded-xl border border-theme text-tertiary flex-shrink-0"
                      aria-label="Remove prepayment"
                    >
                      <i className="ti ti-x" style={{ fontSize: 14 }} aria-hidden="true" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={addPrepayRow}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-theme text-xs font-medium text-secondary"
                >
                  <i className="ti ti-plus" style={{ fontSize: 13 }} aria-hidden="true" />
                  Add prepayment
                </button>
              </div>
            </div>

            {/* Results */}
            {isValid && result.rows.length > 0 && (
              <>
                {/* Summary card */}
                <div>
                  <SectionLabel>Summary</SectionLabel>
                  <div className="surface rounded-2xl p-4">
                    <div className="flex items-center gap-2 pb-1.5 mb-0.5">
                      <span className="flex-1" />
                      <span className="w-24 text-right text-[10px] font-semibold text-tertiary uppercase">
                        Original
                      </span>
                      <span className="w-24 text-right text-[10px] font-semibold text-tertiary uppercase">
                        With plan
                      </span>
                    </div>
                    <CompareRow
                      label="Tenure"
                      original={fmtMonths(baseline.actualTenureMonths)}
                      withPlan={fmtMonths(result.actualTenureMonths)}
                    />
                    <CompareRow
                      label="Total interest"
                      original={mode === 'open' ? formatCurrency(baseline.totalInterest) : '••••'}
                      withPlan={mode === 'open' ? formatCurrency(result.totalInterest) : '••••'}
                    />
                    <CompareRow
                      label="Total paid"
                      original={mode === 'open' ? formatCurrency(baseline.totalEmiPaid) : '••••'}
                      withPlan={mode === 'open' ? formatCurrency(result.totalEmiPaid + result.totalPrepayment) : '••••'}
                    />
                    {result.totalPrepayment > 0 && (
                      <CompareRow
                        label="Total prepayment"
                        original="—"
                        withPlan={mode === 'open' ? formatCurrency(result.totalPrepayment) : '••••'}
                      />
                    )}
                    {hasAccelerators && (
                      <>
                        <CompareRow
                          label="Interest saved"
                          original="—"
                          withPlan={mode === 'open' ? formatCurrency(interestSaved) : '••••'}
                          saving
                        />
                        <CompareRow label="Months saved" original="—" withPlan={fmtMonths(monthsSaved)} saving />
                      </>
                    )}

                    <button
                      onClick={downloadXlsx}
                      className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      <i className="ti ti-table-down" style={{ fontSize: 16 }} aria-hidden="true" />
                      Download XLSX
                    </button>
                  </div>
                </div>

                {/* Amortization table */}
                <div>
                  <SectionLabel>Amortization Schedule</SectionLabel>
                  <div className="surface rounded-2xl overflow-hidden">
                    {/* Header row */}
                    <div
                      className="grid text-[10px] font-semibold text-tertiary uppercase px-3 py-2 border-b border-theme bg-surface-2"
                      style={{ gridTemplateColumns: '2rem 4.5rem 1fr 1fr 1fr 1fr' }}
                    >
                      <span>#</span>
                      <span>Date</span>
                      <span className="text-right">EMI</span>
                      <span className="text-right">Principal</span>
                      <span className="text-right">Interest</span>
                      <span className="text-right">Balance</span>
                    </div>

                    {result.rows.map((r) => (
                      <div key={r.month}>
                        <div
                          className="grid text-xs px-3 py-2 border-b border-theme last:border-0"
                          style={{
                            gridTemplateColumns: '2rem 4.5rem 1fr 1fr 1fr 1fr',
                            backgroundColor: r.prepayment > 0 ? 'var(--color-surface-secondary)' : undefined
                          }}
                        >
                          <span className="text-tertiary">{r.month}</span>
                          <span className="text-tertiary truncate">{r.date}</span>
                          <span className="text-right text-primary font-medium">
                            {mode === 'open' ? formatCurrency(r.emi) : '••'}
                          </span>
                          <span className="text-right text-secondary">
                            {mode === 'open' ? formatCurrency(r.principal) : '••'}
                          </span>
                          <span className="text-right" style={{ color: '#ef4444' }}>
                            {mode === 'open' ? formatCurrency(r.interest) : '••'}
                          </span>
                          <span className="text-right text-primary">
                            {mode === 'open' ? formatCurrency(r.closingBalance) : '••'}
                          </span>
                        </div>
                        {r.prepayment > 0 && (
                          <div
                            className="flex items-center justify-between px-3 py-1 border-b border-theme"
                            style={{ backgroundColor: 'var(--color-surface-secondary)' }}
                          >
                            <span className="text-[10px] font-medium" style={{ color: '#10b981' }}>
                              <i className="ti ti-arrow-down-circle mr-1" style={{ fontSize: 11 }} aria-hidden="true" />
                              Prepayment
                            </span>
                            <span className="text-[10px] font-semibold" style={{ color: '#10b981' }}>
                              {mode === 'open' ? `− ${formatCurrency(r.prepayment)}` : '••••'}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {!isValid && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <i className="ti ti-calculator text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
                <p className="text-sm text-secondary mt-3">
                  Enter principal, rate, and tenure above to see the schedule.
                </p>
              </div>
            )}

            <div style={{ height: 16 }} />
          </div>
        </div>
      )}

      {/* ── Add Loan modal ── */}
      {showAddLoan && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center px-4"
          style={{ paddingTop: 56, paddingBottom: 72, backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowAddLoan(false)}
        >
          <div
            className="surface rounded-2xl w-full max-w-[430px] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-theme flex-shrink-0">
              <h3 className="text-base font-semibold text-primary">Add Loan</h3>
              <button
                onClick={() => setShowAddLoan(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-tertiary"
              >
                <i className="ti ti-x" style={{ fontSize: 16 }} aria-hidden="true" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
              {/* Loan type */}
              <div>
                <p className="text-xs font-medium text-secondary mb-1.5">Loan type</p>
                <div className="grid grid-cols-2 gap-2">
                  {EMI_LOAN_TYPES.map((t) => {
                    const m = LOAN_META[t] ?? { label: t, icon: 'ti-coin', color: 'var(--color-primary)' };
                    return (
                      <button
                        key={t}
                        onClick={() => setFormType(t)}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors text-left"
                        style={
                          formType === t
                            ? { backgroundColor: `${m.color}18`, borderColor: m.color, color: m.color }
                            : {
                                backgroundColor: 'var(--color-surface-secondary)',
                                borderColor: 'var(--color-border)',
                                color: 'var(--color-text-secondary)'
                              }
                        }
                      >
                        <i className={`ti ${m.icon}`} style={{ fontSize: 14 }} aria-hidden="true" />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Name */}
              <div>
                <p className="text-xs font-medium text-secondary mb-1">Loan name</p>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={`e.g. ${LOAN_META[formType]?.label ?? 'My Loan'}`}
                  className="input-surface w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none"
                />
              </div>

              {/* Lender */}
              <div>
                <p className="text-xs font-medium text-secondary mb-1">
                  Lender <span className="text-tertiary font-normal">(optional)</span>
                </p>
                <input
                  type="text"
                  value={formLender}
                  onChange={(e) => setFormLender(e.target.value)}
                  placeholder="e.g. HDFC Bank, SBI"
                  className="input-surface w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none"
                />
              </div>

              {/* Outstanding + Rate */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-medium text-secondary mb-1">Outstanding (₹)</p>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={formOutstanding}
                    onChange={(e) => setFormOutstanding(e.target.value)}
                    placeholder="e.g. 2500000"
                    className="input-surface w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <p className="text-xs font-medium text-secondary mb-1">Rate (% p.a.)</p>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={formRate}
                    onChange={(e) => setFormRate(e.target.value)}
                    placeholder="e.g. 8.5"
                    className="input-surface w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none"
                  />
                </div>
              </div>

              {/* Tenure */}
              <div>
                <p className="text-xs font-medium text-secondary mb-1">Tenure</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center rounded-xl border border-theme bg-surface-2 overflow-hidden">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={formTenureYrs}
                      onChange={(e) => setFormTenureYrs(e.target.value)}
                      placeholder="e.g. 20"
                      className="flex-1 bg-transparent px-3 py-2.5 text-sm text-primary focus:outline-none min-w-0"
                    />
                    <span className="pr-3 text-sm text-tertiary select-none">yr</span>
                  </div>
                  <div className="flex items-center rounded-xl border border-theme bg-surface-2 overflow-hidden">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={formTenureMos}
                      onChange={(e) => setFormTenureMos(e.target.value)}
                      placeholder="0"
                      className="flex-1 bg-transparent px-3 py-2.5 text-sm text-primary focus:outline-none min-w-0"
                    />
                    <span className="pr-3 text-sm text-tertiary select-none">mo</span>
                  </div>
                </div>
              </div>

              {/* Computed EMI */}
              {computedEmi !== null && (
                <div
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                  style={{ backgroundColor: 'var(--color-surface-secondary)' }}
                >
                  <span className="text-xs font-medium text-secondary">Monthly EMI</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
                    {formatCurrency(computedEmi)}
                  </span>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="px-4 py-3 border-t border-theme flex gap-2 flex-shrink-0">
              <button
                onClick={() => setShowAddLoan(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-theme text-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveLoan(crypto.randomUUID(), Date.now())}
                disabled={!formName.trim() || !formOutstanding || !formRate || formSaving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {formSaving ? 'Saving…' : 'Save Loan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
