import { useMemo, useState } from 'react';
import { calcLumpsumFv, calcCagr } from '@/core/calculators/lumpsum';
import { formatPercent } from '@/lib/formatters';
import { LabeledInput, SegmentedToggle, ResultCard, ResultRow, AmountRow, HeroResult } from './CalcUI';

export function LumpsumCalculator() {
  const [mode, setMode] = useState<'fv' | 'cagr'>('fv');

  // Future-value inputs
  const [principal, setPrincipal] = useState('');
  const [rate, setRate] = useState('12');
  const [years, setYears] = useState('10');

  // CAGR inputs
  const [initial, setInitial] = useState('');
  const [final, setFinal] = useState('');
  const [cagrYears, setCagrYears] = useState('5');

  const fvResult = useMemo(() => {
    if (mode !== 'fv') return null;
    const p = parseFloat(principal);
    const y = parseFloat(years);
    if (!(p > 0) || !(y > 0)) return null;
    return calcLumpsumFv({ principal: p, ratePct: parseFloat(rate) || 0, years: y });
  }, [mode, principal, rate, years]);

  const cagrResult = useMemo(() => {
    if (mode !== 'cagr') return null;
    const i = parseFloat(initial);
    const f = parseFloat(final);
    const y = parseFloat(cagrYears);
    if (!(i > 0) || !(f >= 0) || !(y > 0)) return null;
    return calcCagr({ initialValue: i, finalValue: f, years: y });
  }, [mode, initial, final, cagrYears]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl p-4 flex flex-col gap-4 surface">
        <SegmentedToggle
          label="What do you want to find?"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'fv', label: 'Future value' },
            { value: 'cagr', label: 'Return (CAGR)' }
          ]}
        />

        {mode === 'fv' ? (
          <>
            <LabeledInput
              label="Investment amount"
              value={principal}
              onChange={setPrincipal}
              prefix="₹"
              placeholder="e.g. 1,00,000"
            />
            <LabeledInput label="Expected return" value={rate} onChange={setRate} suffix="%" placeholder="12" />
            <LabeledInput label="Investment period" value={years} onChange={setYears} suffix="yrs" placeholder="10" />
          </>
        ) : (
          <>
            <LabeledInput
              label="Amount invested"
              value={initial}
              onChange={setInitial}
              prefix="₹"
              placeholder="e.g. 1,00,000"
            />
            <LabeledInput
              label="Value today / at exit"
              value={final}
              onChange={setFinal}
              prefix="₹"
              placeholder="e.g. 2,50,000"
            />
            <LabeledInput
              label="Holding period"
              value={cagrYears}
              onChange={setCagrYears}
              suffix="yrs"
              placeholder="5"
            />
          </>
        )}
      </div>

      {mode === 'fv' && fvResult && (
        <>
          <HeroResult label="Future value" amount={fvResult.futureValue} note={`after ${years} years`} />
          <ResultCard title="Breakdown">
            <AmountRow label="Amount invested" amount={parseFloat(principal)} />
            <AmountRow label="Wealth gained" amount={fvResult.totalGains} saving />
            <AmountRow label="Future value" amount={fvResult.futureValue} accent />
          </ResultCard>
        </>
      )}

      {mode === 'cagr' && cagrResult && (
        <ResultCard title="Annualised return">
          <ResultRow label="CAGR (per year)" value={formatPercent(cagrResult.cagrPct)} accent />
          <ResultRow label="Absolute return" value={formatPercent(cagrResult.absoluteReturnPct)} />
          <AmountRow label="Total gains" amount={cagrResult.totalGains} saving />
        </ResultCard>
      )}
    </div>
  );
}
