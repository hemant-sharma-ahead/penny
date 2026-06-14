import { useMemo, useState } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import { formatCurrency } from '@/lib/formatters';
import {
  scenarioEmi,
  scenarioExtraEmi,
  scenarioStepUp,
  scenarioLumpSum,
  scenarioBalanceTransfer,
  scenarioCombination,
  calcEmi
} from '@/core/loans/calculator';
import type { PrivacyMode } from '@/context/PrivacyContext';

type ScenarioId = 'emi' | 'extra' | 'stepup' | 'lumpsum' | 'bt' | 'combo';

const SCENARIOS: { id: ScenarioId; label: string; icon: string }[] = [
  { id: 'emi', label: 'EMI Calc', icon: 'ti-calculator' },
  { id: 'extra', label: 'Extra EMI', icon: 'ti-coin' },
  { id: 'stepup', label: 'Step-up', icon: 'ti-trending-up' },
  { id: 'lumpsum', label: 'Lump Sum', icon: 'ti-cash' },
  { id: 'bt', label: 'Bal. Transfer', icon: 'ti-arrows-exchange' },
  { id: 'combo', label: 'Combo', icon: 'ti-sparkles' }
];

function fmtAmt(n: number, mode: PrivacyMode): string {
  return mode === 'open' ? formatCurrency(Math.abs(Math.round(n))) : '••••';
}

function fmtMonths(m: number): string {
  const y = Math.floor(m / 12);
  const mo = m % 12;
  if (y === 0) return `${mo}m`;
  if (mo === 0) return `${y}y`;
  return `${y}y ${mo}m`;
}

interface RowProps {
  label: string;
  value: string;
  accent?: boolean;
  saving?: boolean;
}

function Row({ label, value, accent, saving }: RowProps) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-secondary">{label}</span>
      <span
        className="text-sm font-semibold"
        style={{ color: saving ? '#10b981' : accent ? 'var(--color-primary)' : 'var(--color-text-primary)' }}
      >
        {value}
      </span>
    </div>
  );
}

interface LabeledInputProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
}

function LabeledInput({ label, hint, value, onChange, placeholder, prefix, suffix }: LabeledInputProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-xs font-medium text-secondary">{label}</label>
        {hint && <span className="text-[10px] text-tertiary">{hint}</span>}
      </div>
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-sm pointer-events-none select-none text-tertiary">{prefix}</span>
        )}
        <input
          type="number"
          inputMode="decimal"
          className="w-full rounded-xl border py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] input-surface"
          style={{
            paddingLeft: prefix ? '1.75rem' : '0.75rem',
            paddingRight: suffix ? '2.5rem' : '0.75rem'
          }}
          placeholder={placeholder ?? '0'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && (
          <span className="absolute right-3 text-sm pointer-events-none select-none text-tertiary">{suffix}</span>
        )}
      </div>
    </div>
  );
}

export function LoanScenariosPage() {
  const { mode } = usePrivacy();
  const [scenario, setScenario] = useState<ScenarioId>('emi');

  // Shared inputs (used by all except balance transfer)
  const [principal, setPrincipal] = useState('');
  const [annualRate, setAnnualRate] = useState('');
  const [tenureMonths, setTenureMonths] = useState('');

  // Scenario-specific inputs
  const [extraPerYear, setExtraPerYear] = useState('1');
  const [startEmi, setStartEmi] = useState('');
  const [stepUpPct, setStepUpPct] = useState('10');
  const [prepayMonth, setPrepayMonth] = useState('');
  const [lumpSum, setLumpSum] = useState('');
  const [outstanding, setOutstanding] = useState('');
  const [remainingMonths, setRemainingMonths] = useState('');
  const [currentRate, setCurrentRate] = useState('');
  const [newRate, setNewRate] = useState('');
  const [processingFee, setProcessingFee] = useState('');
  const [comboExtra, setComboExtra] = useState('1');
  const [comboLump, setComboLump] = useState('');

  // ── Parse shared ─────────────────────────────────────────────────────────────
  const p = parseFloat(principal);
  const r = parseFloat(annualRate);
  const n = parseFloat(tenureMonths);
  const sharedOk = p > 0 && r >= 0 && n > 0;

  const suggestedStartEmi = sharedOk ? Math.round(calcEmi(p, r, n) * 0.75) : 0;

  // ── Results via useMemo ────────────────────────────────────────────────────────

  const emiResult = useMemo(() => {
    if (scenario !== 'emi' || !sharedOk) return null;
    return scenarioEmi(p, r, n);
  }, [scenario, p, r, n, sharedOk]);

  const extraResult = useMemo(() => {
    if (scenario !== 'extra' || !sharedOk) return null;
    const extra = parseFloat(extraPerYear);
    if (!(extra > 0)) return null;
    return scenarioExtraEmi(p, r, n, extra);
  }, [scenario, p, r, n, sharedOk, extraPerYear]);

  const stepUpResult = useMemo(() => {
    if (scenario !== 'stepup' || !sharedOk) return null;
    const se = startEmi ? parseFloat(startEmi) : suggestedStartEmi;
    const sup = parseFloat(stepUpPct);
    if (!(se > 0) || !(sup >= 0)) return null;
    return scenarioStepUp(p, r, n, se, sup);
  }, [scenario, p, r, n, sharedOk, startEmi, stepUpPct, suggestedStartEmi]);

  const lumpSumResult = useMemo(() => {
    if (scenario !== 'lumpsum' || !sharedOk) return null;
    const pm = parseFloat(prepayMonth);
    const ls = parseFloat(lumpSum);
    if (!(pm > 0) || !(ls > 0)) return null;
    return scenarioLumpSum(p, r, n, pm, ls);
  }, [scenario, p, r, n, sharedOk, prepayMonth, lumpSum]);

  const btResult = useMemo(() => {
    if (scenario !== 'bt') return null;
    const os = parseFloat(outstanding);
    const rm = parseFloat(remainingMonths);
    const cr = parseFloat(currentRate);
    const nr = parseFloat(newRate);
    const fee = processingFee ? parseFloat(processingFee) : 0;
    if (!(os > 0) || !(rm > 0) || !(cr >= 0) || !(nr >= 0)) return null;
    return scenarioBalanceTransfer(os, rm, cr, nr, fee);
  }, [scenario, outstanding, remainingMonths, currentRate, newRate, processingFee]);

  const comboResult = useMemo(() => {
    if (scenario !== 'combo' || !sharedOk) return null;
    const extra = parseFloat(comboExtra);
    const ls = comboLump ? parseFloat(comboLump) : 0;
    if (!(extra >= 0) || !(ls >= 0)) return null;
    return scenarioCombination(p, r, n, extra, ls);
  }, [scenario, p, r, n, sharedOk, comboExtra, comboLump]);

  // ── Shared input block ────────────────────────────────────────────────────────
  const sharedInputs = (
    <>
      <LabeledInput
        label="Loan principal (₹)"
        value={principal}
        onChange={setPrincipal}
        prefix="₹"
        placeholder="e.g. 50,00,000"
      />
      <LabeledInput
        label="Annual interest rate"
        value={annualRate}
        onChange={setAnnualRate}
        suffix="%"
        placeholder="e.g. 8.5"
      />
      <LabeledInput
        label="Loan tenure"
        value={tenureMonths}
        onChange={setTenureMonths}
        suffix="mo"
        placeholder="e.g. 240"
      />
    </>
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-theme">
        <h2 className="text-xl font-semibold text-primary">Loan Scenarios</h2>
        <p className="text-xs mt-0.5 text-tertiary">On-device calculations — nothing leaves your phone</p>
      </div>

      {/* Scenario selector */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-theme">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => setScenario(s.id)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={
              scenario === s.id
                ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                : { backgroundColor: 'var(--color-surface-secondary)', color: 'var(--color-text-secondary)' }
            }
          >
            <i className={`ti ${s.icon}`} style={{ fontSize: 13 }} aria-hidden="true" />
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24 flex flex-col gap-4">
        {/* ── Inputs ── */}
        <div className="rounded-2xl p-4 flex flex-col gap-4 surface">
          {/* Scenario 1: EMI Calculator */}
          {scenario === 'emi' && sharedInputs}

          {/* Scenario 2: Extra EMI */}
          {scenario === 'extra' && (
            <>
              {sharedInputs}
              <LabeledInput
                label="Extra EMIs per year"
                hint="e.g. from annual bonus"
                value={extraPerYear}
                onChange={setExtraPerYear}
                placeholder="1"
              />
            </>
          )}

          {/* Scenario 3: Step-up */}
          {scenario === 'stepup' && (
            <>
              {sharedInputs}
              <LabeledInput
                label="Starting EMI (₹)"
                {...(suggestedStartEmi > 0 ? { hint: `suggested: ${formatCurrency(suggestedStartEmi)}` } : {})}
                value={startEmi}
                onChange={setStartEmi}
                prefix="₹"
                placeholder={suggestedStartEmi > 0 ? String(suggestedStartEmi) : 'e.g. 30,000'}
              />
              <LabeledInput
                label="Annual EMI step-up"
                hint="increase each year"
                value={stepUpPct}
                onChange={setStepUpPct}
                suffix="%"
                placeholder="10"
              />
            </>
          )}

          {/* Scenario 4: Lump Sum */}
          {scenario === 'lumpsum' && (
            <>
              {sharedInputs}
              <LabeledInput
                label="Prepayment at month"
                hint="EMI number when you pay"
                value={prepayMonth}
                onChange={setPrepayMonth}
                placeholder="e.g. 24"
              />
              <LabeledInput
                label="Lump sum amount (₹)"
                value={lumpSum}
                onChange={setLumpSum}
                prefix="₹"
                placeholder="e.g. 5,00,000"
              />
            </>
          )}

          {/* Scenario 5: Balance Transfer */}
          {scenario === 'bt' && (
            <>
              <LabeledInput
                label="Outstanding principal (₹)"
                value={outstanding}
                onChange={setOutstanding}
                prefix="₹"
                placeholder="e.g. 40,00,000"
              />
              <LabeledInput
                label="Remaining tenure"
                value={remainingMonths}
                onChange={setRemainingMonths}
                suffix="mo"
                placeholder="e.g. 180"
              />
              <LabeledInput
                label="Current rate"
                value={currentRate}
                onChange={setCurrentRate}
                suffix="%"
                placeholder="e.g. 9.5"
              />
              <LabeledInput
                label="New (lower) rate"
                value={newRate}
                onChange={setNewRate}
                suffix="%"
                placeholder="e.g. 8.5"
              />
              <LabeledInput
                label="Processing fee (₹)"
                hint="optional"
                value={processingFee}
                onChange={setProcessingFee}
                prefix="₹"
                placeholder="0"
              />
            </>
          )}

          {/* Scenario 6: Combination */}
          {scenario === 'combo' && (
            <>
              {sharedInputs}
              <LabeledInput label="Extra EMIs per year" value={comboExtra} onChange={setComboExtra} placeholder="1" />
              <LabeledInput
                label="Annual lump sum (₹)"
                hint="optional"
                value={comboLump}
                onChange={setComboLump}
                prefix="₹"
                placeholder="0"
              />
            </>
          )}
        </div>

        {/* ── Results ── */}

        {/* Scenario 1 */}
        {scenario === 'emi' && emiResult && (
          <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4">
            <p className="text-xs font-semibold text-emerald-700 mb-2 uppercase tracking-wide">Results</p>
            <div className="divide-y divide-emerald-100">
              <Row label="Monthly EMI" value={fmtAmt(emiResult.emi, mode)} accent />
              <Row label="Total interest" value={fmtAmt(emiResult.totalInterest, mode)} />
              <Row label="Total payment" value={fmtAmt(emiResult.totalPayment, mode)} />
              <Row label="Interest as % of principal" value={`${emiResult.interestPct.toFixed(1)}%`} />
            </div>
          </div>
        )}

        {/* Scenario 2 */}
        {scenario === 'extra' && extraResult && (
          <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4">
            <p className="text-xs font-semibold text-emerald-700 mb-2 uppercase tracking-wide">Results</p>
            <div className="divide-y divide-emerald-100">
              <Row label="Original tenure" value={fmtMonths(extraResult.baseMonths)} />
              <Row label="New tenure" value={fmtMonths(extraResult.newMonths)} accent />
              <Row label="Time saved" value={`${fmtMonths(extraResult.monthsSaved)} faster`} saving />
              <Row label="Original interest" value={fmtAmt(extraResult.baseInterest, mode)} />
              <Row label="New interest" value={fmtAmt(extraResult.newInterest, mode)} />
              <Row label="Interest saved" value={fmtAmt(extraResult.interestSaved, mode)} saving />
            </div>
          </div>
        )}

        {/* Scenario 3 */}
        {scenario === 'stepup' && stepUpResult && (
          <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4">
            <p className="text-xs font-semibold text-emerald-700 mb-2 uppercase tracking-wide">Results</p>
            <div className="divide-y divide-emerald-100">
              <Row label="Starting EMI" value={fmtAmt(stepUpResult.startingEmi, mode)} accent />
              <Row label="Flat EMI (standard)" value={fmtAmt(stepUpResult.flatEmi, mode)} />
              <Row label="Effective tenure" value={fmtMonths(stepUpResult.actualMonths)} />
              <Row label="Flat EMI interest" value={fmtAmt(stepUpResult.baseInterest, mode)} />
              <Row label="Step-up interest" value={fmtAmt(stepUpResult.newInterest, mode)} />
              {stepUpResult.interestDiff >= 0 ? (
                <Row label="Interest saved" value={fmtAmt(stepUpResult.interestDiff, mode)} saving />
              ) : (
                <Row label="Extra interest paid" value={fmtAmt(-stepUpResult.interestDiff, mode)} />
              )}
            </div>
            {stepUpResult.actualMonths > n * 2 && (
              <p className="text-xs text-amber-600 mt-3 bg-amber-50 rounded-lg p-2">
                Starting EMI may be too low — loan takes significantly longer than planned.
              </p>
            )}
          </div>
        )}

        {/* Scenario 4 */}
        {scenario === 'lumpsum' && lumpSumResult && (
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl p-4 bg-surface-2 border border-theme">
              <p className="text-xs font-medium mb-2 text-secondary">At month {prepayMonth}</p>
              <div className="divide-y divide-[var(--color-border)]">
                <Row label="Outstanding balance" value={fmtAmt(lumpSumResult.balanceAtMonth, mode)} />
                <Row label="Interest remaining (base)" value={fmtAmt(lumpSumResult.baseInterestAfter, mode)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-3">
                <p className="text-[11px] font-semibold text-emerald-700 mb-2">Option A — Reduce tenure</p>
                <p className="text-xs text-secondary">Remaining tenure</p>
                <p className="text-sm font-semibold text-primary">
                  {fmtMonths(lumpSumResult.optionA.newRemainingMonths)}
                </p>
                <p className="text-[10px] text-emerald-600 mt-0.5">
                  {fmtMonths(lumpSumResult.optionA.monthsSaved)} saved
                </p>
                <p className="text-xs text-secondary mt-2">Interest after</p>
                <p className="text-sm font-semibold text-primary">
                  {fmtAmt(lumpSumResult.optionA.interestAfter, mode)}
                </p>
              </div>
              <div className="bg-blue-50 rounded-2xl border border-blue-100 p-3">
                <p className="text-[11px] font-semibold text-blue-700 mb-2">Option B — Reduce EMI</p>
                <p className="text-xs text-secondary">New monthly EMI</p>
                <p className="text-sm font-semibold text-primary">{fmtAmt(lumpSumResult.optionB.newEmi, mode)}</p>
                <p className="text-[10px] text-blue-600 mt-0.5">
                  {fmtAmt(lumpSumResult.optionB.emiReduction, mode)} lower
                </p>
                <p className="text-xs text-secondary mt-2">Interest after</p>
                <p className="text-sm font-semibold text-primary">
                  {fmtAmt(lumpSumResult.optionB.interestAfter, mode)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Scenario 5: Balance Transfer */}
        {scenario === 'bt' && btResult === null && outstanding && remainingMonths && currentRate && newRate && (
          <div className="bg-amber-50 rounded-2xl border border-amber-100 p-4">
            <p className="text-sm text-amber-700">
              New rate must be lower than current rate for a balance transfer to make sense.
            </p>
          </div>
        )}
        {scenario === 'bt' && btResult && (
          <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4">
            <p className="text-xs font-semibold text-emerald-700 mb-2 uppercase tracking-wide">Results</p>
            <div className="divide-y divide-emerald-100">
              <Row label="Current EMI" value={fmtAmt(btResult.currentEmi, mode)} />
              <Row label="New EMI" value={fmtAmt(btResult.newEmi, mode)} accent />
              <Row label="EMI reduction" value={fmtAmt(btResult.emiReduction, mode)} saving />
              <Row label="Interest remaining (current)" value={fmtAmt(btResult.currentInterestRemaining, mode)} />
              <Row label="Interest remaining (new)" value={fmtAmt(btResult.newInterestRemaining, mode)} />
              <Row label="Gross saving" value={fmtAmt(btResult.grossSaving, mode)} saving />
              <Row
                label="Net saving (after fee)"
                value={
                  btResult.netSaving >= 0 ? fmtAmt(btResult.netSaving, mode) : `−${fmtAmt(-btResult.netSaving, mode)}`
                }
                saving={btResult.netSaving >= 0}
              />
              {btResult.breakEvenMonths !== null && (
                <Row label="Break-even" value={`${fmtMonths(btResult.breakEvenMonths)} to recover fee`} />
              )}
            </div>
          </div>
        )}

        {/* Scenario 6 */}
        {scenario === 'combo' && comboResult && (
          <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4">
            <p className="text-xs font-semibold text-emerald-700 mb-2 uppercase tracking-wide">Results</p>
            <div className="divide-y divide-emerald-100">
              <Row label="Original tenure" value={fmtMonths(comboResult.baseMonths)} />
              <Row label="New tenure" value={fmtMonths(comboResult.newMonths)} accent />
              <Row label="Time saved" value={`${fmtMonths(comboResult.monthsSaved)} faster`} saving />
              <Row label="Original interest" value={fmtAmt(comboResult.baseInterest, mode)} />
              <Row label="New interest" value={fmtAmt(comboResult.newInterest, mode)} />
              <Row label="Total saving" value={fmtAmt(comboResult.interestSaved, mode)} saving />
            </div>
          </div>
        )}

        {/* Privacy hint */}
        {mode !== 'open' && (
          <p className="text-xs text-center pb-2 text-tertiary">
            <i className="ti ti-eye-off mr-1" aria-hidden="true" />
            Switch to Open mode to see calculated amounts
          </p>
        )}
      </div>
    </div>
  );
}
