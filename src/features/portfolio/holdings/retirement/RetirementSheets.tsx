import { useState, useMemo } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import { Modal, Button, TextInput, SegmentedControl, DetailRow } from '@/components/ui';
import { epochToDateInput } from '@/lib/formatters';
import { LIFECYCLE_FUNDS } from '@/core/nps';
import type { NpsLifecycleFund } from '@/core/nps';
import { isBeforeFifth } from '@/core/portfolio/ppfCalculations';
import {
  EPF_EMPLOYER_EPF_PCT,
  EPS_PCT,
  epfCurrentEmployer,
  epfLatestSalary,
  epfComputeAllMonths
} from '@/core/portfolio/epfCalculations';
import type { EpfMonthEntry } from '@/core/portfolio/epfCalculations';
import type {
  Holding,
  EpfEmployer,
  EpfSalaryHike,
  EpfTransaction,
  EpfTransactionType,
  PpfTransaction,
  PpfTransactionType
} from '@/core/db/types';

export function AllocationPills({ equity, corporate, govt }: { equity: number; corporate: number; govt: number }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      <span
        className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
        style={{ backgroundColor: '#0ea5e915', color: '#0ea5e9' }}
      >
        E {equity}%
      </span>
      <span
        className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
        style={{ backgroundColor: '#f59e0b15', color: '#d97706' }}
      >
        C {corporate}%
      </span>
      <span
        className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
        style={{ backgroundColor: '#10b98115', color: '#10b981' }}
      >
        G {govt}%
      </span>
    </div>
  );
}

// ─── NpsScheduleSheet ─────────────────────────────────────────────────────────

export function NpsScheduleSheet({ holding, onClose }: { holding: Holding; onClose: () => void }) {
  const meta = holding.assetMeta ?? {};
  const fund = meta.npsLifecycleFund as NpsLifecycleFund | undefined;
  if (!fund || !LIFECYCLE_FUNDS[fund]) return null;

  const config = LIFECYCLE_FUNDS[fund];
  const currentYear = new Date().getFullYear();
  const userAge = meta.npsBirthYear ? currentYear - meta.npsBirthYear : null;
  const currentAgeRow = userAge != null ? Math.max(35, Math.min(55, userAge)) : null;

  return (
    <Modal onClose={onClose} title={config.label} scrollable>
      <div className="flex items-center gap-2 -mt-2">
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${config.color}18`, color: config.color }}
        >
          {config.shortLabel}
        </span>
        <p className="text-xs text-secondary leading-snug">{config.description}</p>
      </div>
      {userAge != null && (
        <p className="text-xs text-secondary">
          Your age: <strong className="text-primary">{userAge}</strong>
          {userAge < 35 && ' — PFRDA schedule starts at 35 (current allocation: max equity)'}
          {userAge > 55 && ' — PFRDA schedule ends at 55 (current allocation: min equity)'}
        </p>
      )}
      <div className="rounded-xl overflow-hidden border border-theme">
        <table className="w-full text-xs table-fixed">
          <colgroup>
            <col style={{ width: '25%' }} />
            <col style={{ width: '25%' }} />
            <col style={{ width: '25%' }} />
            <col style={{ width: '25%' }} />
          </colgroup>
          <thead>
            <tr style={{ backgroundColor: 'var(--color-surface-secondary)' }}>
              <th className="text-left px-3 py-2 font-semibold text-tertiary">Age</th>
              <th className="text-right px-2 py-2 font-semibold" style={{ color: '#0ea5e9' }}>
                Equity
              </th>
              <th className="text-right px-2 py-2 font-semibold" style={{ color: '#d97706' }}>
                Corp.
              </th>
              <th className="text-right px-3 py-2 font-semibold" style={{ color: '#10b981' }}>
                Govt.
              </th>
            </tr>
          </thead>
          <tbody>
            {config.table.map((row) => {
              const isCurrent = row.age === currentAgeRow;
              return (
                <tr
                  key={row.age}
                  style={
                    isCurrent
                      ? { backgroundColor: 'color-mix(in srgb, var(--color-primary) 8%, transparent)' }
                      : undefined
                  }
                >
                  <td className="px-3 py-2">
                    <span className={isCurrent ? 'font-bold text-primary' : 'text-secondary'}>
                      {row.age}
                      {isCurrent && ' ← you'}
                    </span>
                  </td>
                  <td className="text-right px-2 py-2 tabular-nums font-medium" style={{ color: '#0ea5e9' }}>
                    {row.equity}%
                  </td>
                  <td className="text-right px-2 py-2 tabular-nums font-medium" style={{ color: '#d97706' }}>
                    {row.corporate}%
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums font-medium" style={{ color: '#10b981' }}>
                    {row.govt}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-tertiary leading-relaxed">
        Source: PFRDA lifecycle fund circular. Ages below 35 use the 35-year allocation; ages above 55 use the 55-year
        allocation.
      </p>
    </Modal>
  );
}

// ─── PpfTransactionSheet ──────────────────────────────────────────────────────

export function PpfTransactionSheet({
  holding,
  onSave,
  onClose
}: {
  holding: Holding;
  onSave: (updated: Holding) => Promise<void>;
  onClose: () => void;
}) {
  const [txType, setTxType] = useState<PpfTransactionType>('deposit');
  const [txDate, setTxDate] = useState(() => epochToDateInput(Date.now()));
  const [txAmount, setTxAmount] = useState('');
  const [txNote, setTxNote] = useState('');
  const [saving, setSaving] = useState(false);

  const dateMs = txDate ? new Date(txDate).getTime() : 0;
  const beforeFifth = isBeforeFifth(dateMs);
  const showFifthHint = txType === 'deposit' && txDate !== '';

  function handleAdd() {
    const amt = parseFloat(txAmount);
    if (isNaN(amt) || amt <= 0) return;
    setSaving(true);
    const newTx: PpfTransaction = {
      id: crypto.randomUUID(),
      type: txType,
      date: dateMs,
      amount: amt,
      ...(txNote.trim() && { note: txNote.trim() })
    };
    const existing = holding.assetMeta?.ppfTransactions ?? [];
    const updated: Holding = {
      ...holding,
      assetMeta: { ...holding.assetMeta, ppfTransactions: [...existing, newTx] },
      updatedAt: Date.now()
    };
    onSave(updated)
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  const typeConfig: Record<PpfTransactionType, { label: string; color: string }> = {
    deposit: { label: 'Deposit', color: '#8b5cf6' },
    interest: { label: 'Interest credited', color: '#10b981' },
    withdrawal: { label: 'Withdrawal', color: '#f59e0b' }
  };

  return (
    <Modal onClose={onClose} title="Add PPF transaction">
      {/* Transaction type */}
      <SegmentedControl
        options={(['deposit', 'interest', 'withdrawal'] as PpfTransactionType[]).map((t) => ({
          value: t,
          label: typeConfig[t].label,
          color: typeConfig[t].color
        }))}
        value={txType}
        onChange={(v) => setTxType(v as PpfTransactionType)}
      />

      {/* Date */}
      <div>
        <TextInput label="Date" type="date" value={txDate} onChange={(val) => setTxDate(val)} />
        {showFifthHint && (
          <p
            className="mt-1 text-xs font-medium flex items-center gap-1"
            style={{ color: beforeFifth ? '#10b981' : '#f59e0b' }}
          >
            <i
              className={`ti ${beforeFifth ? 'ti-circle-check' : 'ti-alert-triangle'}`}
              style={{ fontSize: 13 }}
              aria-hidden="true"
            />
            {beforeFifth ? 'Before 5th — earns interest this month' : 'After 5th — interest starts next month'}
          </p>
        )}
      </div>

      <TextInput
        label="Amount (₹)"
        type="number"
        inputMode="decimal"
        placeholder="0"
        value={txAmount}
        onChange={(val) => setTxAmount(val)}
        autoFocus
      />

      <TextInput
        label="Note (optional)"
        placeholder="e.g. Annual lump sum"
        value={txNote}
        onChange={(val) => setTxNote(val)}
      />

      <Button
        variant="primary"
        size="lg"
        fullWidth
        onClick={handleAdd}
        disabled={saving || !txAmount || parseFloat(txAmount) <= 0}
        loading={saving}
      >
        {saving ? 'Saving…' : 'Add transaction'}
      </Button>
    </Modal>
  );
}

const EPF_TX_LABELS: Record<EpfTransactionType, string> = {
  contribution: 'Contribution',
  interest: 'Interest credit',
  transfer_in: 'Transfer in',
  withdrawal: 'Withdrawal',
  advance: 'Advance'
};
const EPF_TX_COLORS: Record<EpfTransactionType, string> = {
  contribution: '#64748b',
  interest: '#10b981',
  transfer_in: '#0ea5e9',
  withdrawal: '#f59e0b',
  advance: '#f59e0b'
};

// ─── EpfAllTransactionsSheet ─────────────────────────────────────────────────

export function EpfAllTransactionsSheet({
  holding,
  onAddTransaction,
  onClose
}: {
  holding: Holding;
  onAddTransaction: () => void;
  onClose: () => void;
}) {
  const { mode } = usePrivacy();
  const [filter, setFilter] = useState<'all' | 'interest' | 'transfer'>('all');
  const [selectedMonth, setSelectedMonth] = useState<EpfMonthEntry | null>(null);

  const allMonths = useMemo(
    () => epfComputeAllMonths(holding.assetMeta?.epfEmployers ?? []),
    [holding.assetMeta?.epfEmployers]
  );

  const nonContribTxns = useMemo(
    () => (holding.assetMeta?.epfTransactions ?? []).filter((tx) => tx.type !== 'contribution'),
    [holding.assetMeta?.epfTransactions]
  );

  type FYGroup = {
    label: string;
    startYear: number;
    months: EpfMonthEntry[];
    otherTxns: EpfTransaction[];
    totalEmployee: number;
    totalEmployerEpf: number;
  };

  const fyGroups = useMemo(() => {
    const groups = new Map<string, FYGroup>();

    if (filter === 'all') {
      for (const m of allMonths) {
        if (!groups.has(m.fyLabel)) {
          groups.set(m.fyLabel, {
            label: m.fyLabel,
            startYear: m.fyStartYear,
            months: [],
            otherTxns: [],
            totalEmployee: 0,
            totalEmployerEpf: 0
          });
        }
        const g = groups.get(m.fyLabel);
        if (!g) continue;
        g.months.push(m);
        g.totalEmployee += m.empAmount;
        g.totalEmployerEpf += m.eplrEpfAmount;
      }
    }

    for (const tx of nonContribTxns) {
      if (filter === 'interest' && tx.type !== 'interest') continue;
      if (filter === 'transfer' && tx.type !== 'transfer_in') continue;
      const d = new Date(tx.date);
      const mo = d.getMonth() + 1;
      const yr = d.getFullYear();
      const s = mo >= 4 ? yr : yr - 1;
      const fyLabel = `FY ${s}-${String(s + 1).slice(2)}`;
      if (!groups.has(fyLabel)) {
        groups.set(fyLabel, {
          label: fyLabel,
          startYear: s,
          months: [],
          otherTxns: [],
          totalEmployee: 0,
          totalEmployerEpf: 0
        });
      }
      groups.get(fyLabel)?.otherTxns.push(tx);
    }

    return [...groups.values()].sort((a, b) => b.startYear - a.startYear);
  }, [allMonths, nonContribTxns, filter]);

  return (
    <>
      {/* Sheet — stays below app header (z-40) and bottom nav (z-50) */}
      <div
        className="fixed left-1/2 -translate-x-1/2 w-full max-w-[430px] flex flex-col z-30"
        style={{ top: 48, bottom: 64, backgroundColor: 'var(--color-surface-tertiary)' }}
      >
        {/* Sheet header */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-theme bg-surface flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-primary">EPF Transactions</h3>
            <p className="text-[10px] text-tertiary">
              {allMonths.length} months · {holding.assetMeta?.epfEmployers?.length ?? 0} employers
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onAddTransaction}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full"
              style={{ backgroundColor: '#64748b15', color: '#64748b' }}
            >
              <i className="ti ti-plus" style={{ fontSize: 12 }} aria-hidden="true" />
              Add
            </button>
            <button
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-tertiary"
            >
              <i className="ti ti-x" style={{ fontSize: 20 }} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Filter pills */}
        <div className="px-4 py-2.5 border-b border-theme bg-surface flex-shrink-0">
          <SegmentedControl
            options={[
              { value: 'all', label: 'All', color: '#64748b' },
              { value: 'interest', label: 'Interest', color: '#64748b' },
              { value: 'transfer', label: 'Transfers', color: '#64748b' }
            ]}
            value={filter}
            onChange={(v) => setFilter(v as 'all' | 'interest' | 'transfer')}
          />
        </div>

        {/* FY grouped list */}
        <div className="flex-1 overflow-y-auto">
          {fyGroups.length === 0 && <p className="text-center text-sm text-tertiary mt-16">No transactions to show.</p>}
          {fyGroups.map((group) => (
            <div key={group.label}>
              {/* FY sticky header */}
              <div className="px-4 py-2 flex items-center justify-between sticky top-0 z-10 border-b border-theme bg-surface-2">
                <p className="text-xs font-bold text-primary">{group.label}</p>
                {filter === 'all' && group.months.length > 0 && (
                  <p className="text-[10px] text-tertiary tabular-nums">
                    {group.months.length} months
                    {mode === 'open' && ` · ₹${(group.totalEmployee + group.totalEmployerEpf).toLocaleString('en-IN')}`}
                  </p>
                )}
              </div>

              {/* Interest / transfer / other stored transactions */}
              {[...group.otherTxns]
                .sort((a, b) => b.date - a.date)
                .map((tx) => (
                  <div key={tx.id} className="px-4 py-2.5 flex items-center gap-3 border-b border-theme">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${EPF_TX_COLORS[tx.type]}18` }}
                    >
                      <i
                        className={`ti ${tx.type === 'interest' ? 'ti-percentage' : tx.type === 'transfer_in' ? 'ti-arrows-exchange' : 'ti-minus'}`}
                        style={{ fontSize: 13, color: EPF_TX_COLORS[tx.type] }}
                        aria-hidden="true"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold" style={{ color: EPF_TX_COLORS[tx.type] }}>
                        {EPF_TX_LABELS[tx.type]}
                      </p>
                      <p className="text-[10px] text-tertiary">
                        {new Date(tx.date).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                        {tx.note && ` · ${tx.note}`}
                      </p>
                    </div>
                    <p
                      className="text-xs font-bold tabular-nums flex-shrink-0"
                      style={{ color: EPF_TX_COLORS[tx.type] }}
                    >
                      {mode === 'open' ? `₹${(tx.amount ?? 0).toLocaleString('en-IN')}` : '••••'}
                    </p>
                  </div>
                ))}

              {/* Auto-computed monthly contribution rows */}
              {filter === 'all' &&
                group.months.map((entry) => (
                  <button
                    key={entry.month}
                    onClick={() => setSelectedMonth(entry)}
                    className="w-full px-4 py-2 flex items-center gap-3 border-b border-theme text-left active:bg-surface-2"
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: '#64748b10' }}
                    >
                      <i
                        className="ti ti-building-factory-2"
                        style={{ fontSize: 12, color: '#64748b' }}
                        aria-hidden="true"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-primary">{entry.month}</p>
                      <p className="text-[10px] text-tertiary">{entry.companyName}</p>
                    </div>
                    <div className="text-right flex-shrink-0 flex items-center gap-1.5">
                      {mode === 'open' ? (
                        <div className="text-right">
                          <p className="text-xs font-semibold text-primary tabular-nums">
                            ₹{(entry.empAmount + entry.eplrEpfAmount).toLocaleString('en-IN')}
                          </p>
                          <p className="text-[9px] text-tertiary tabular-nums">
                            ₹{entry.empAmount.toLocaleString('en-IN')} + ₹{entry.eplrEpfAmount.toLocaleString('en-IN')}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs font-medium text-primary">••••</p>
                      )}
                      <i className="ti ti-chevron-right text-tertiary" style={{ fontSize: 12 }} aria-hidden="true" />
                    </div>
                  </button>
                ))}
            </div>
          ))}
          <div className="h-4" />
        </div>
      </div>

      {/* Contribution breakdown detail popup */}
      {selectedMonth && (
        <div
          className="fixed inset-0 flex items-center justify-center p-6"
          style={{ zIndex: 45, backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setSelectedMonth(null)}
        >
          <div className="surface rounded-2xl p-4 w-full max-w-[320px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-bold text-primary">{selectedMonth.month}</p>
                <p className="text-[10px] text-tertiary">
                  {selectedMonth.companyName}
                  {selectedMonth.proRata && (
                    <span
                      className="ml-1.5 px-1 py-0.5 rounded text-[9px] font-semibold"
                      style={{ backgroundColor: '#f59e0b18', color: '#f59e0b' }}
                    >
                      Pro-rata {selectedMonth.proRata.workedDays}/{selectedMonth.proRata.totalDays} days
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setSelectedMonth(null)}
                className="w-8 h-8 flex items-center justify-center text-tertiary"
              >
                <i className="ti ti-x" style={{ fontSize: 16 }} aria-hidden="true" />
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              <DetailRow
                label="Employee contribution"
                value={mode === 'open' ? `₹${selectedMonth.empAmount.toLocaleString('en-IN')}` : '••••'}
                size="md"
              />
              <DetailRow
                label="Employer → EPF (3.67%)"
                value={mode === 'open' ? `₹${selectedMonth.eplrEpfAmount.toLocaleString('en-IN')}` : '••••'}
                size="md"
              />
              <DetailRow
                label="Employer → EPS (8.33%)"
                value={
                  <span style={{ color: '#94a3b8' }}>
                    {mode === 'open' ? `₹${selectedMonth.epsAmount.toLocaleString('en-IN')}` : '••••'}
                  </span>
                }
                size="md"
              />
              <DetailRow
                label={<span className="font-semibold">Total to EPF</span>}
                value={
                  mode === 'open'
                    ? `₹${(selectedMonth.empAmount + selectedMonth.eplrEpfAmount).toLocaleString('en-IN')}`
                    : '••••'
                }
                size="md"
                className="border-t border-theme pt-1.5 mt-0.5"
              />
              <p className="text-[10px] text-tertiary pt-0.5">EPS goes to pension — not withdrawable</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── EpfTransactionSheet ─────────────────────────────────────────────────────

export function EpfTransactionSheet({
  holding,
  onSave,
  onClose
}: {
  holding: Holding;
  onSave: (updated: Holding) => Promise<void>;
  onClose: () => void;
}) {
  const currentEmp = epfCurrentEmployer(holding.assetMeta?.epfEmployers ?? []);
  const basic = currentEmp?.basicSalary ?? 0;
  const empPct = (currentEmp?.employeeContribPct ?? 12) / 100;

  const [txType, setTxType] = useState<EpfTransactionType>('contribution');
  const [txDate, setTxDate] = useState(() => epochToDateInput(Date.now()));
  const [wagesMonth, setWagesMonth] = useState(() => {
    const d = new Date(Date.now());
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [empAmount, setEmpAmount] = useState(() => (basic > 0 ? String(Math.round(basic * empPct)) : ''));
  const [emplrAmount, setEmplrAmount] = useState(() =>
    basic > 0 ? String(Math.round(basic * EPF_EMPLOYER_EPF_PCT)) : ''
  );
  const [epsAmount, setEpsAmount] = useState(() => (basic > 0 ? String(Math.round(basic * EPS_PCT)) : ''));
  const [amount, setAmount] = useState('');
  const [txNote, setTxNote] = useState('');
  const [saving, setSaving] = useState(false);

  const isContribution = txType === 'contribution';

  function canSave() {
    if (isContribution) return parseFloat(empAmount) > 0 || parseFloat(emplrAmount) > 0;
    return parseFloat(amount) > 0;
  }

  function handleSave() {
    if (!canSave()) return;
    setSaving(true);
    const tx: EpfTransaction = { id: crypto.randomUUID(), type: txType, date: new Date(txDate).getTime() };
    if (isContribution) {
      tx.wagesMonth = wagesMonth;
      const ea = parseFloat(empAmount);
      const era = parseFloat(emplrAmount);
      const epa = parseFloat(epsAmount);
      if (!isNaN(ea) && ea > 0) tx.employeeAmount = ea;
      if (!isNaN(era) && era > 0) tx.employerAmount = era;
      if (!isNaN(epa) && epa > 0) tx.pensionAmount = epa;
    } else {
      tx.amount = parseFloat(amount);
    }
    if (txNote.trim()) tx.note = txNote.trim();

    const updated: Holding = {
      ...holding,
      assetMeta: {
        ...holding.assetMeta,
        epfTransactions: [...(holding.assetMeta?.epfTransactions ?? []), tx]
      },
      updatedAt: Date.now()
    };
    onSave(updated)
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  const TYPE_PILLS: { type: EpfTransactionType; label: string }[] = [
    { type: 'contribution', label: 'Contribution' },
    { type: 'interest', label: 'Interest' },
    { type: 'transfer_in', label: 'Transfer in' },
    { type: 'withdrawal', label: 'Withdrawal' },
    { type: 'advance', label: 'Advance' }
  ];

  return (
    <Modal onClose={onClose} title="Add EPF transaction" scrollable>
      {/* Type pills */}
      <div className="flex gap-2 flex-wrap">
        {TYPE_PILLS.map(({ type, label }) => (
          <button
            key={type}
            onClick={() => setTxType(type)}
            className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
            style={
              txType === type
                ? { backgroundColor: '#64748b', color: '#fff', borderColor: '#64748b' }
                : {
                    backgroundColor: 'var(--color-surface-secondary)',
                    color: 'var(--color-text-secondary)',
                    borderColor: 'var(--color-border)'
                  }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Wages month — contribution only */}
      {isContribution && (
        <TextInput label="Wages month" type="month" value={wagesMonth} onChange={(val) => setWagesMonth(val)} />
      )}

      <TextInput label="Date of credit" type="date" value={txDate} onChange={(val) => setTxDate(val)} />

      {/* Contribution amounts */}
      {isContribution ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <TextInput
              label="Employee share (₹)"
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={empAmount}
              onChange={(val) => setEmpAmount(val)}
            />
            <TextInput
              label="Employer to EPF (₹)"
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={emplrAmount}
              onChange={(val) => setEmplrAmount(val)}
            />
          </div>
          <TextInput
            label="EPS pension (₹) (optional — info only)"
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={epsAmount}
            onChange={(val) => setEpsAmount(val)}
          />
        </div>
      ) : (
        <TextInput
          label="Amount (₹)"
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(val) => setAmount(val)}
          autoFocus
        />
      )}

      <TextInput
        label="Note (optional)"
        placeholder="e.g. Transfer from previous employer"
        value={txNote}
        onChange={(val) => setTxNote(val)}
      />

      <button
        onClick={handleSave}
        disabled={saving || !canSave()}
        className="w-full py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: '#64748b' }}
      >
        {saving ? 'Saving…' : 'Add transaction'}
      </button>
    </Modal>
  );
}

// ─── EpfSalaryHikeSheet ───────────────────────────────────────────────────────

export function EpfSalaryHikeSheet({
  holding,
  empId,
  onSave,
  onClose
}: {
  holding: Holding;
  empId: string;
  onSave: (updated: Holding) => Promise<void>;
  onClose: () => void;
}) {
  const emp = (holding.assetMeta?.epfEmployers ?? []).find((e) => e.id === empId);
  const [hikeMonth, setHikeMonth] = useState('');
  const [hikeBasic, setHikeBasic] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = hikeMonth && parseFloat(hikeBasic) > 0;

  function handleSave(id: string, ts: number) {
    if (!canSave || !emp) return;
    setSaving(true);
    const hikeMs = new Date(`${hikeMonth}-01T00:00:00`).getTime();
    const newHike: EpfSalaryHike = { fromDate: hikeMs, basicSalary: parseFloat(hikeBasic) };
    const updatedHikes = [...(emp.hikeTimeline ?? []), newHike].sort((a, b) => a.fromDate - b.fromDate);
    const updatedEmp: EpfEmployer = { ...emp, hikeTimeline: updatedHikes };
    const updated: Holding = {
      ...holding,
      assetMeta: {
        ...holding.assetMeta,
        epfEmployers: (holding.assetMeta?.epfEmployers ?? []).map((e) => (e.id === empId ? updatedEmp : e))
      },
      updatedAt: ts,
      id
    };
    onSave(updated)
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  if (!emp) return null;

  const minMonth = new Date(emp.fromDate).toISOString().slice(0, 7);
  const maxMonth = emp.toDate ? new Date(emp.toDate).toISOString().slice(0, 7) : undefined;

  return (
    <Modal onClose={onClose} title="Add Salary Hike" nested>
      <p className="text-xs text-tertiary -mt-2">{emp.companyName}</p>

      <TextInput
        label="Effective from (month)"
        type="month"
        value={hikeMonth}
        onChange={(val) => setHikeMonth(val)}
        min={minMonth}
        max={maxMonth}
        autoFocus
      />

      <TextInput
        label="New basic + DA salary (₹/mo)"
        type="number"
        inputMode="decimal"
        placeholder={`Current: ₹${epfLatestSalary(emp).toLocaleString('en-IN')}`}
        value={hikeBasic}
        onChange={(val) => setHikeBasic(val)}
      />

      <div className="flex gap-3">
        <Button variant="secondary" size="lg" onClick={onClose} className="flex-1">
          Cancel
        </Button>
        <Button
          variant="primary"
          size="lg"
          disabled={!canSave || saving}
          loading={saving}
          onClick={() => handleSave(holding.id, Date.now())}
          className="flex-1"
        >
          {saving ? 'Saving…' : 'Save Hike'}
        </Button>
      </div>
    </Modal>
  );
}

// ─── EpfEmployerSheet ─────────────────────────────────────────────────────────

export function EpfEmployerSheet({
  holding,
  onSave,
  onClose
}: {
  holding: Holding;
  onSave: (updated: Holding) => Promise<void>;
  onClose: () => void;
}) {
  const [company, setCompany] = useState('');
  const [basic, setBasic] = useState('');
  const [fromMonth, setFromMonth] = useState('');
  const [toMonth, setToMonth] = useState('');
  const [empPct, setEmpPct] = useState('12');
  const [saving, setSaving] = useState(false);

  const canSave = company.trim() && parseFloat(basic) > 0 && fromMonth && toMonth;

  function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const emp: EpfEmployer = {
      id: crypto.randomUUID(),
      companyName: company.trim(),
      basicSalary: parseFloat(basic),
      employeeContribPct: parseFloat(empPct) || 12,
      fromDate: new Date(`${fromMonth}-01`).getTime(),
      toDate: new Date(`${toMonth}-01`).getTime()
    };
    const updated: Holding = {
      ...holding,
      assetMeta: {
        ...holding.assetMeta,
        epfEmployers: [...(holding.assetMeta?.epfEmployers ?? []), emp]
      },
      updatedAt: Date.now()
    };
    onSave(updated)
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  return (
    <Modal onClose={onClose} title="Add previous employer" scrollable>
      <TextInput
        label="Company name"
        placeholder="e.g. Wipro, Infosys"
        value={company}
        onChange={(val) => setCompany(val)}
        autoFocus
      />

      <TextInput
        label="Basic + DA salary (₹/mo)"
        type="number"
        inputMode="decimal"
        placeholder="e.g. 35000"
        value={basic}
        onChange={(val) => setBasic(val)}
      />

      <div className="grid grid-cols-2 gap-3">
        <TextInput label="From" type="month" value={fromMonth} onChange={(val) => setFromMonth(val)} />
        <TextInput label="To" type="month" value={toMonth} onChange={(val) => setToMonth(val)} />
      </div>

      <div>
        <TextInput
          label="Employee contribution %"
          type="number"
          inputMode="decimal"
          placeholder="12"
          value={empPct}
          onChange={(val) => setEmpPct(val)}
        />
        <p className="mt-1 text-[11px] text-tertiary">Default 12%. Can be higher if you opted for VPF.</p>
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !canSave}
        className="w-full py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: '#64748b' }}
      >
        {saving ? 'Saving…' : 'Add employer'}
      </button>
    </Modal>
  );
}
