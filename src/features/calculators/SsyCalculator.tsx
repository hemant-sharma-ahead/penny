import { useMemo, useState } from 'react';
import { calcSsy, SSY_DEFAULT_RATE_PCT, SSY_MAX_ANNUAL, SSY_MIN_ANNUAL } from '@/core/calculators/ssy';
import { MaskedValue } from '@/components/privacy/MaskedValue';
import { formatCurrency } from '@/lib/formatters';
import { LabeledInput, ResultCard, AmountRow, HeroResult } from './CalcUI';

export function SsyCalculator() {
  const [deposit, setDeposit] = useState('');
  const [rate, setRate] = useState(String(SSY_DEFAULT_RATE_PCT));

  const result = useMemo(() => {
    const d = parseFloat(deposit);
    if (!(d > 0)) return null;
    return calcSsy({ annualDeposit: d, ratePct: parseFloat(rate) || 0 });
  }, [deposit, rate]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl p-4 flex flex-col gap-4 surface">
        <LabeledInput
          label="Yearly deposit"
          hint="₹250 – ₹1.5L per year"
          value={deposit}
          onChange={setDeposit}
          prefix="₹"
          placeholder="e.g. 1,50,000"
        />
        <LabeledInput label="Interest rate" value={rate} onChange={setRate} suffix="%" placeholder="8.2" />
      </div>

      {result && (
        <>
          <HeroResult label="Maturity value" amount={result.maturityValue} note="at 21 years from opening" />

          {(result.depositBelowMin || result.depositAboveMax) && (
            <div
              className="rounded-2xl p-4 flex items-start gap-3"
              style={{ backgroundColor: '#f59e0b1a', border: '1px solid #f59e0b' }}
            >
              <i className="ti ti-alert-triangle" style={{ fontSize: 20, color: '#f59e0b' }} aria-hidden="true" />
              <p className="text-xs text-secondary">
                {result.depositBelowMin
                  ? `The minimum yearly deposit is ${formatCurrency(SSY_MIN_ANNUAL)}.`
                  : `The maximum yearly deposit is ${formatCurrency(SSY_MAX_ANNUAL)} — amounts above this don't earn interest.`}
              </p>
            </div>
          )}

          <ResultCard title="Breakdown">
            <AmountRow label="Total deposited (15 years)" amount={result.totalDeposited} />
            <AmountRow label="Interest earned" amount={result.totalInterest} saving />
            <AmountRow label="Maturity value" amount={result.maturityValue} accent />
          </ResultCard>

          {/* Year-by-year passbook */}
          <div className="rounded-2xl p-4 surface">
            <p className="text-xs font-semibold mb-2 uppercase tracking-wide text-tertiary">Year-by-year growth</p>
            <div className="grid grid-cols-3 gap-2 text-[11px] font-medium text-tertiary pb-1.5 border-b border-theme">
              <span>Year</span>
              <span className="text-right">Deposit</span>
              <span className="text-right">Balance</span>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {result.schedule.map((row) => (
                <div key={row.year} className="grid grid-cols-3 gap-2 py-1.5 text-xs items-center">
                  <span className="text-secondary">Year {row.year}</span>
                  <MaskedValue value={formatCurrency(row.deposit)} className="text-right text-primary" />
                  <MaskedValue value={formatCurrency(row.balance)} className="text-right font-medium" />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
