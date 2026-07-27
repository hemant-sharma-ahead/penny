import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { calcSsy, SSY_DEFAULT_RATE_PCT, SSY_MAX_ANNUAL, SSY_MIN_ANNUAL } from '@/core/calculators/ssy';
import { formatCurrency } from '@/lib/formatters';
import { Banner } from '~/components/ui';
import { usePrivacy } from '~/context/PrivacyContext';
import { LabeledInput, ResultCard, AmountRow, HeroResult } from './CalcUI';

/** RN port of apps/web-react/src/features/calculators/SsyCalculator.tsx. Web's `divide-y` passbook
 *  rows use the same border-top-on-non-first-child technique as `CalcUI.tsx`'s `ResultCard`. */
export function SsyCalculator() {
  // Calculator output (salary/income-derived figures) is always-sensitive in Safe mode, matching web's
  // MaskedValue (masks whenever mode is 'safe' or 'privacy', regardless of any per-field flag) — pass
  // `true`, not `false`; `shouldMask(false)` would leave Safe mode fully unmasked here.
  const masked = usePrivacy().shouldMask(true);
  const [deposit, setDeposit] = useState('');
  const [rate, setRate] = useState(String(SSY_DEFAULT_RATE_PCT));

  const result = useMemo(() => {
    const d = parseFloat(deposit);
    if (!(d > 0)) return null;
    return calcSsy({ annualDeposit: d, ratePct: parseFloat(rate) || 0 });
  }, [deposit, rate]);

  return (
    <View className="gap-4">
      <View className="rounded-2xl p-4 gap-4 bg-surface border border-theme">
        <LabeledInput
          label="Yearly deposit"
          hint="₹250 – ₹1.5L per year"
          value={deposit}
          onChange={setDeposit}
          prefix="₹"
          placeholder="e.g. 1,50,000"
        />
        <LabeledInput label="Interest rate" value={rate} onChange={setRate} suffix="%" placeholder="8.2" />
      </View>

      {result && (
        <>
          <HeroResult
            label="Maturity value"
            amount={result.maturityValue}
            note="at 21 years from opening"
            masked={masked}
          />

          {(result.depositBelowMin || result.depositAboveMax) && (
            <Banner variant="warning">
              {result.depositBelowMin
                ? `The minimum yearly deposit is ${formatCurrency(SSY_MIN_ANNUAL)}.`
                : `The maximum yearly deposit is ${formatCurrency(SSY_MAX_ANNUAL)} — amounts above this don't earn interest.`}
            </Banner>
          )}

          <ResultCard title="Breakdown">
            <AmountRow label="Total deposited (15 years)" amount={result.totalDeposited} masked={masked} />
            <AmountRow label="Interest earned" amount={result.totalInterest} saving masked={masked} />
            <AmountRow label="Maturity value" amount={result.maturityValue} accent masked={masked} />
          </ResultCard>

          {/* Year-by-year passbook */}
          <View className="rounded-2xl p-4 bg-surface border border-theme">
            <Text className="text-xs font-semibold uppercase tracking-wide text-tertiary mb-2">
              Year-by-year growth
            </Text>
            <View className="flex-row gap-2 pb-1.5 border-b border-theme">
              <Text className="flex-1 text-[11px] font-medium text-tertiary">Year</Text>
              <Text className="flex-1 text-[11px] font-medium text-tertiary text-right">Deposit</Text>
              <Text className="flex-1 text-[11px] font-medium text-tertiary text-right">Balance</Text>
            </View>
            {result.schedule.map((row, i) => (
              <View
                key={row.year}
                className={`flex-row gap-2 py-1.5 items-center ${i > 0 ? 'border-t border-theme' : ''}`}
              >
                <Text className="flex-1 text-xs text-secondary">Year {row.year}</Text>
                <Text className="flex-1 text-xs text-primary text-right">
                  {masked ? '••••' : formatCurrency(row.deposit)}
                </Text>
                <Text className="flex-1 text-xs font-medium text-primary text-right">
                  {masked ? '••••' : formatCurrency(row.balance)}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
