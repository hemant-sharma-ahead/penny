import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { calcSipSwp } from '@/core/calculators/sipSwp';
import { formatCurrency } from '@/lib/formatters';
import { Banner } from '~/components/ui';
import { usePrivacy } from '~/context/PrivacyContext';
import { LabeledInput, SegmentedToggle, ResultCard, AmountRow, HeroResult } from './CalcUI';

function lastedLabel(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} month${m === 1 ? '' : 's'}`;
  if (m === 0) return `${y} year${y === 1 ? '' : 's'}`;
  return `${y}y ${m}m`;
}

/** RN port of apps/web-legacy/src/features/calculators/SipSwpCalculator.tsx. Web's `divide-y` drawdown
 *  rows use the same border-top-on-non-first-row technique as `CalcUI.tsx`'s `ResultCard`. */
export function SipSwpCalculator() {
  const masked = usePrivacy().shouldMask(false);
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
    <View className="gap-4">
      {/* Accumulation inputs */}
      <View className="rounded-2xl p-4 gap-4 bg-surface">
        <Text className="text-xs font-semibold uppercase tracking-wide text-tertiary">Accumulation — SIP</Text>
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
      </View>

      {/* Withdrawal phase */}
      <View className="rounded-2xl p-4 gap-4 bg-surface">
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
      </View>

      {result && (
        <>
          <HeroResult
            label={result.hasSwp ? 'Corpus at start of withdrawals' : 'Future value'}
            amount={result.corpusAtRetirement}
            note={`after ${sipYears} years of investing`}
            masked={masked}
          />

          <ResultCard title="Accumulation (SIP)">
            <AmountRow label="Total invested" amount={result.totalInvested} masked={masked} />
            <AmountRow label="Wealth gained" amount={result.accumulationGains} saving masked={masked} />
            <AmountRow label="Final year's monthly SIP" amount={result.finalMonthlySip} masked={masked} />
          </ResultCard>

          {result.hasSwp && (
            <>
              {/* Outcome banner */}
              <Banner variant={result.corpusDepleted ? 'danger' : 'success'}>
                {result.corpusDepleted ? 'Corpus runs out early. ' : 'Corpus lasts the full period. '}
                {result.corpusDepleted && result.monthsCorpusLasted != null
                  ? `Your money lasts about ${lastedLabel(result.monthsCorpusLasted)} into a ${swpYears}-year plan. Trim withdrawals, raise returns, or invest longer.`
                  : `After ${swpYears} years of withdrawals you still have a balance left.`}
              </Banner>

              <ResultCard title="Withdrawal (SWP)">
                <AmountRow label="Total withdrawn" amount={result.totalWithdrawn} accent masked={masked} />
                <AmountRow label="Growth during withdrawals" amount={result.withdrawalGains} saving masked={masked} />
                <AmountRow label="Final monthly withdrawal" amount={result.finalMonthlyWithdrawal} masked={masked} />
                <AmountRow label="Corpus left at end" amount={result.corpusAtEnd} masked={masked} />
              </ResultCard>

              {/* Year-by-year drawdown */}
              {result.withdrawalSchedule.length > 0 && (
                <View className="rounded-2xl p-4 bg-surface">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-tertiary mb-2">
                    Drawdown schedule
                  </Text>
                  <View className="flex-row gap-2 pb-1.5 border-b border-theme">
                    <Text className="flex-1 text-[11px] font-medium text-tertiary">Year</Text>
                    <Text className="flex-1 text-[11px] font-medium text-tertiary text-right">Withdrawn</Text>
                    <Text className="flex-1 text-[11px] font-medium text-tertiary text-right">Year-end corpus</Text>
                  </View>
                  {result.withdrawalSchedule.map((row, i) => (
                    <View
                      key={row.year}
                      className={`flex-row gap-2 py-1.5 items-center ${i > 0 ? 'border-t border-theme' : ''}`}
                    >
                      <Text className="flex-1 text-xs text-secondary">Year {row.year}</Text>
                      <Text className="flex-1 text-xs text-primary text-right">
                        {masked ? '••••' : formatCurrency(row.withdrawnInYear)}
                      </Text>
                      <Text className="flex-1 text-xs font-medium text-primary text-right">
                        {masked ? '••••' : formatCurrency(row.yearEndCorpus)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </>
      )}
    </View>
  );
}
