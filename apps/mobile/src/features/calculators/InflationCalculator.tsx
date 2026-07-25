import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { calcInflation } from '@/core/calculators/inflation';
import { usePrivacy } from '~/context/PrivacyContext';
import { LabeledInput, ResultCard, AmountRow, HeroResult } from './CalcUI';

/** RN port of apps/web-legacy/src/features/calculators/InflationCalculator.tsx. */
export function InflationCalculator() {
  const masked = usePrivacy().shouldMask(false);
  const [cost, setCost] = useState('');
  const [inflation, setInflation] = useState('6');
  const [years, setYears] = useState('10');

  const result = useMemo(() => {
    const c = parseFloat(cost);
    const y = parseFloat(years);
    if (!(c > 0) || !(y > 0)) return null;
    return calcInflation({ currentCost: c, inflationPct: parseFloat(inflation) || 0, years: y });
  }, [cost, inflation, years]);

  return (
    <View className="gap-4">
      <View className="rounded-2xl p-4 gap-4 bg-surface">
        <LabeledInput label="Cost today" value={cost} onChange={setCost} prefix="₹" placeholder="e.g. 1,00,000" />
        <LabeledInput label="Expected inflation" value={inflation} onChange={setInflation} suffix="%" placeholder="6" />
        <LabeledInput label="Years from now" value={years} onChange={setYears} suffix="yrs" placeholder="10" />
      </View>

      {result && (
        <>
          <HeroResult
            label="Future cost"
            amount={result.futureCost}
            note={`what ₹${cost} buys in ${years} years`}
            masked={masked}
          />
          <ResultCard title="The cost of inflation">
            <AmountRow label="Cost today" amount={parseFloat(cost)} masked={masked} />
            <AmountRow label="Cost in the future" amount={result.futureCost} accent masked={masked} />
            <AmountRow label="Extra needed" amount={result.increase} masked={masked} />
          </ResultCard>
          <ResultCard title="Shrinking purchasing power">
            <AmountRow label="What today's money will be worth" amount={result.erodedValue} accent masked={masked} />
            <AmountRow label="Purchasing power lost" amount={result.purchasingPowerLost} masked={masked} />
          </ResultCard>
        </>
      )}
    </View>
  );
}
