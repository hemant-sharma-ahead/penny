import { useMemo, useState } from 'react';
import { calcSipSwp } from '@/core/calculators/sipSwp';
import { MaskedValue } from '@/components/privacy/MaskedValue';
import { formatCurrency } from '@/lib/formatters';
import { Banner } from '@/components/ui';
import { LabeledInput, SegmentedToggle, ResultCard, AmountRow, HeroResult } from './CalcUI';

function lastedLabel(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} month${m === 1 ? '' : 's'}`;
  if (m === 0) return `${y} year${y === 1 ? '' : 's'}`;
  return `${y}y ${m}m`;
}

export function SipSwpCalculator() {
  // Accumulation (SIP) inputs
  const [monthly, setMonthly] = useState('');
  const [stepUp, setStepUp] = useState('10');
  const [sipReturn, setSipReturn] = useState('12');
  const [sipYears, setSipYears] = useState('20');

  // Withdrawal (SWP) inputs
  const [swpOn, setSwpOn] = useState<'no' | 'yes'>('no');
  const [withdrawal, setWithdrawal] = useState('');
  const [withdrawalIncrease, setWithdrawalIncrease] = useState('6');
  const [swpReturn, setSwpReturn] = useState('8');
  const [swpYears, setSwpYears] = useState('25');

  const swpEnabled = swpOn === 'yes';

  const result = useMemo(() => {
    const m = parseFloat(monthly);
    const y = parseFloat(sipYears);
    if (!(m > 0) || !(y > 0)) return null;
    return calcSipSwp({
      monthlyInvestment: m,
      annualStepUpPct: parseFloat(stepUp) || 0,
      accumulationReturnPct: parseFloat(sipReturn) || 0,
      accumulationYears: y,
      monthlyWithdrawal: swpEnabled ? parseFloat(withdrawal) || 0 : 0,
      annualWithdrawalIncreasePct: parseFloat(withdrawalIncrease) || 0,
      withdrawalReturnPct: parseFloat(swpReturn) || 0,
      withdrawalYears: swpEnabled ? parseFloat(swpYears) || 0 : 0
    });
  }, [monthly, stepUp, sipReturn, sipYears, swpEnabled, withdrawal, withdrawalIncrease, swpReturn, swpYears]);

  return (
    <div className="flex flex-col gap-4">
      {/* Accumulation inputs */}
      <div className="rounded-2xl p-4 flex flex-col gap-4 surface">
        <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Accumulation — SIP</p>
        <LabeledInput
          label="Starting monthly SIP"
          value={monthly}
          onChange={setMonthly}
          prefix="₹"
          placeholder="e.g. 10,000"
        />
        <LabeledInput
          label="Annual step-up"
          hint="increase each year"
          value={stepUp}
          onChange={setStepUp}
          suffix="%"
          placeholder="10"
        />
        <LabeledInput label="Expected return" value={sipReturn} onChange={setSipReturn} suffix="%" placeholder="12" />
        <LabeledInput label="Investment period" value={sipYears} onChange={setSipYears} suffix="yrs" placeholder="20" />
      </div>

      {/* Withdrawal phase */}
      <div className="rounded-2xl p-4 flex flex-col gap-4 surface">
        <SegmentedToggle
          label="Add a withdrawal phase (SWP)?"
          value={swpOn}
          onChange={setSwpOn}
          options={[
            { value: 'no', label: 'No' },
            { value: 'yes', label: 'Yes' }
          ]}
        />
        {swpEnabled && (
          <>
            <LabeledInput
              label="Monthly withdrawal"
              hint="at start of SWP"
              value={withdrawal}
              onChange={setWithdrawal}
              prefix="₹"
              placeholder="e.g. 50,000"
            />
            <LabeledInput
              label="Annual increase"
              hint="for inflation"
              value={withdrawalIncrease}
              onChange={setWithdrawalIncrease}
              suffix="%"
              placeholder="6"
            />
            <LabeledInput
              label="Expected return"
              hint="post-retirement"
              value={swpReturn}
              onChange={setSwpReturn}
              suffix="%"
              placeholder="8"
            />
            <LabeledInput
              label="Withdrawal period"
              value={swpYears}
              onChange={setSwpYears}
              suffix="yrs"
              placeholder="25"
            />
          </>
        )}
      </div>

      {result && (
        <>
          <HeroResult
            label={result.hasSwp ? 'Corpus at start of withdrawals' : 'Future value'}
            amount={result.corpusAtRetirement}
            note={`after ${sipYears} years of investing`}
          />

          <ResultCard title="Accumulation (SIP)">
            <AmountRow label="Total invested" amount={result.totalInvested} />
            <AmountRow label="Wealth gained" amount={result.accumulationGains} saving />
            <AmountRow label="Final year's monthly SIP" amount={result.finalMonthlySip} />
          </ResultCard>

          {result.hasSwp && (
            <>
              {/* Outcome banner */}
              <Banner variant={result.corpusDepleted ? 'danger' : 'success'}>
                <p className="text-sm font-semibold">
                  {result.corpusDepleted ? 'Corpus runs out early' : 'Corpus lasts the full period'}
                </p>
                <p className="text-xs text-secondary mt-0.5">
                  {result.corpusDepleted && result.monthsCorpusLasted != null
                    ? `Your money lasts about ${lastedLabel(result.monthsCorpusLasted)} into a ${swpYears}-year plan. Trim withdrawals, raise returns, or invest longer.`
                    : `After ${swpYears} years of withdrawals you still have a balance left.`}
                </p>
              </Banner>

              <ResultCard title="Withdrawal (SWP)">
                <AmountRow label="Total withdrawn" amount={result.totalWithdrawn} accent />
                <AmountRow label="Growth during withdrawals" amount={result.withdrawalGains} saving />
                <AmountRow label="Final monthly withdrawal" amount={result.finalMonthlyWithdrawal} />
                <AmountRow label="Corpus left at end" amount={result.corpusAtEnd} />
              </ResultCard>

              {/* Year-by-year drawdown */}
              {result.withdrawalSchedule.length > 0 && (
                <div className="rounded-2xl p-4 surface">
                  <p className="text-xs font-semibold mb-2 uppercase tracking-wide text-tertiary">Drawdown schedule</p>
                  <div className="grid grid-cols-3 gap-2 text-[11px] font-medium text-tertiary pb-1.5 border-b border-theme">
                    <span>Year</span>
                    <span className="text-right">Withdrawn</span>
                    <span className="text-right">Year-end corpus</span>
                  </div>
                  <div className="divide-y divide-[var(--color-border)]">
                    {result.withdrawalSchedule.map((row) => (
                      <div key={row.year} className="grid grid-cols-3 gap-2 py-1.5 text-xs items-center">
                        <span className="text-secondary">Year {row.year}</span>
                        <MaskedValue value={formatCurrency(row.withdrawnInYear)} className="text-right text-primary" />
                        <MaskedValue value={formatCurrency(row.yearEndCorpus)} className="text-right font-medium" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
