import { useMemo, useState } from 'react';
import { calcFire } from '@/core/calculators/fire';
import { LabeledInput, ResultCard, ResultRow, AmountRow, HeroResult } from './CalcUI';

export function FireCalculator() {
  const [currentAge, setCurrentAge] = useState('30');
  const [monthlyExpenses, setMonthlyExpenses] = useState('');
  const [currentCorpus, setCurrentCorpus] = useState('');
  const [monthlyInvestment, setMonthlyInvestment] = useState('');
  const [expectedReturn, setExpectedReturn] = useState('12');
  const [inflation, setInflation] = useState('6');
  const [swr, setSwr] = useState('4');

  const result = useMemo(() => {
    const age = parseFloat(currentAge);
    const exp = parseFloat(monthlyExpenses);
    if (!(age >= 0) || !(exp > 0)) return null;
    return calcFire({
      currentAge: age,
      monthlyExpenses: exp,
      currentCorpus: parseFloat(currentCorpus) || 0,
      monthlyInvestment: parseFloat(monthlyInvestment) || 0,
      expectedReturnPct: parseFloat(expectedReturn) || 0,
      inflationPct: parseFloat(inflation) || 0,
      swrPct: parseFloat(swr) || 0
    });
  }, [currentAge, monthlyExpenses, currentCorpus, monthlyInvestment, expectedReturn, inflation, swr]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl p-4 flex flex-col gap-4 surface">
        <LabeledInput label="Current age" value={currentAge} onChange={setCurrentAge} suffix="yrs" placeholder="30" />
        <LabeledInput
          label="Monthly expenses (today)"
          value={monthlyExpenses}
          onChange={setMonthlyExpenses}
          prefix="₹"
          placeholder="e.g. 50,000"
        />
        <LabeledInput
          label="Current corpus"
          hint="already invested"
          value={currentCorpus}
          onChange={setCurrentCorpus}
          prefix="₹"
          placeholder="e.g. 10,00,000"
        />
        <LabeledInput
          label="Monthly investment"
          value={monthlyInvestment}
          onChange={setMonthlyInvestment}
          prefix="₹"
          placeholder="e.g. 50,000"
        />
        <LabeledInput
          label="Expected annual return"
          value={expectedReturn}
          onChange={setExpectedReturn}
          suffix="%"
          placeholder="12"
        />
        <LabeledInput label="Inflation" value={inflation} onChange={setInflation} suffix="%" placeholder="6" />
        <LabeledInput
          label="Safe withdrawal rate"
          hint="4% is the common rule"
          value={swr}
          onChange={setSwr}
          suffix="%"
          placeholder="4"
        />
      </div>

      {result && (
        <>
          <HeroResult label="Your FIRE number (today's money)" amount={result.fireNumber} />
          <ResultCard title="Projection">
            {result.yearsToFi !== null ? (
              <>
                <ResultRow
                  label="Years to financial independence"
                  value={result.yearsToFi === 0 ? 'Already there 🎉' : `${result.yearsToFi} years`}
                  accent
                />
                {result.fiAge !== null && <ResultRow label="Age at FI" value={`${result.fiAge} years`} />}
                <AmountRow label="Corpus at FI" amount={result.corpusAtFi} />
                <AmountRow label="Target at FI (inflation-adjusted)" amount={result.targetAtFi} />
              </>
            ) : (
              <ResultRow label="Years to FI" value="Not reached in 70 yrs — invest more" />
            )}
          </ResultCard>
          {result.yearsToFi === null && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
              At this savings rate, inflation outpaces your corpus growth toward the target. Try increasing your monthly
              investment or expected return.
            </p>
          )}
        </>
      )}
    </div>
  );
}
