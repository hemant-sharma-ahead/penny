import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { calcGratuity } from '@/core/calculators/gratuity';
import { Banner } from '~/components/ui';
import { usePrivacy } from '~/context/PrivacyContext';
import { LabeledInput, ResultCard, AmountRow, HeroResult } from './CalcUI';

/** RN port of apps/web-legacy/src/features/calculators/GratuityCalculator.tsx. */
export function GratuityCalculator() {
  const masked = usePrivacy().shouldMask(false);
  const [salary, setSalary] = useState('');
  const [years, setYears] = useState('');
  const [months, setMonths] = useState('0');

  const result = useMemo(() => {
    const s = parseFloat(salary);
    const y = parseFloat(years);
    const m = parseFloat(months);
    if (!(s > 0) || !(y >= 0) || !(m >= 0)) return null;
    if (!(y > 0) && !(m > 0)) return null;
    return calcGratuity({ lastMonthlySalary: s, serviceYears: y, serviceMonths: m });
  }, [salary, years, months]);

  return (
    <View className="gap-4">
      <View className="rounded-2xl p-4 gap-4 bg-surface">
        <LabeledInput
          label="Last drawn salary (Basic + DA)"
          hint="per month"
          value={salary}
          onChange={setSalary}
          prefix="₹"
          placeholder="e.g. 50,000"
        />
        <LabeledInput label="Years of service" value={years} onChange={setYears} suffix="yrs" placeholder="e.g. 7" />
        <LabeledInput
          label="Additional months"
          hint="0–11"
          value={months}
          onChange={setMonths}
          suffix="mo"
          placeholder="0"
        />
      </View>

      {result && (
        <>
          <HeroResult
            label="Gratuity payable"
            amount={result.gratuity}
            note={`based on ${result.roundedYears} years of service`}
            masked={masked}
          />

          {!result.eligible && (
            <Banner variant="warning">
              Below the 5-year minimum. Gratuity is normally payable only after 5 years of continuous service. This
              figure is indicative.
            </Banner>
          )}

          <ResultCard title="Breakdown">
            <AmountRow label="Gratuity payable" amount={result.gratuity} accent masked={masked} />
            {result.isCapped && (
              <AmountRow label="Formula value (before cap)" amount={result.uncappedGratuity} masked={masked} />
            )}
          </ResultCard>

          {result.isCapped && (
            <Text className="text-[11px] text-center text-tertiary">
              Capped at the ₹20,00,000 statutory tax-free ceiling.
            </Text>
          )}
          <Text className="text-[11px] text-center text-tertiary">
            Formula: (15 ÷ 26) × monthly salary × years of service. A part-year over 6 months counts as a full year.
          </Text>
        </>
      )}
    </View>
  );
}
