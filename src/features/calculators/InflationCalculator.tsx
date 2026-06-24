import { useMemo, useState } from 'react';
import { calcInflation } from '@/core/calculators/inflation';
import { LabeledInput, ResultCard, AmountRow, HeroResult } from './CalcUI';

export function InflationCalculator() {
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
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl p-4 flex flex-col gap-4 surface">
        <LabeledInput label="Cost today" value={cost} onChange={setCost} prefix="₹" placeholder="e.g. 1,00,000" />
        <LabeledInput label="Expected inflation" value={inflation} onChange={setInflation} suffix="%" placeholder="6" />
        <LabeledInput label="Years from now" value={years} onChange={setYears} suffix="yrs" placeholder="10" />
      </div>

      {result && (
        <>
          <HeroResult label="Future cost" amount={result.futureCost} note={`what ₹${cost} buys in ${years} years`} />
          <ResultCard title="The cost of inflation">
            <AmountRow label="Cost today" amount={parseFloat(cost)} />
            <AmountRow label="Cost in the future" amount={result.futureCost} accent />
            <AmountRow label="Extra needed" amount={result.increase} />
          </ResultCard>
          <ResultCard title="Shrinking purchasing power">
            <AmountRow label="What today's money will be worth" amount={result.erodedValue} accent />
            <AmountRow label="Purchasing power lost" amount={result.purchasingPowerLost} />
          </ResultCard>
        </>
      )}
    </div>
  );
}
