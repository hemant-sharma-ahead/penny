import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { calcFire } from '@/core/calculators/fire';
import { useProfile } from '@/hooks/useProfile';
import { deriveAge } from '@/lib/date';
import { usePrivacy } from '~/context/PrivacyContext';
import { LabeledInput, ResultCard, ResultRow, AmountRow, HeroResult } from './CalcUI';

/** RN port of apps/web-react/src/features/calculators/FireCalculator.tsx. */
export function FireCalculator() {
  const masked = usePrivacy().shouldMask(false);
  // Age is pre-filled from the profile's DOB but the user's own input always wins.
  const { profile } = useProfile();
  const derivedAge = profile?.dob ? deriveAge(profile.dob) : null;
  const [ageOverride, setAgeOverride] = useState<string | null>(null);
  const currentAge = ageOverride ?? (derivedAge !== null ? String(derivedAge) : '30');
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
    <View className="gap-4">
      <View className="rounded-2xl p-4 gap-4 bg-surface">
        <LabeledInput label="Current age" value={currentAge} onChange={setAgeOverride} suffix="yrs" placeholder="30" />
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
      </View>

      {result && (
        <>
          <HeroResult label="Your FIRE number (today's money)" amount={result.fireNumber} masked={masked} />
          <ResultCard title="Projection">
            {result.yearsToFi !== null ? (
              <>
                <ResultRow
                  label="Years to financial independence"
                  value={result.yearsToFi === 0 ? 'Already there 🎉' : `${result.yearsToFi} years`}
                  accent
                />
                {result.fiAge !== null && <ResultRow label="Age at FI" value={`${result.fiAge} years`} />}
                <AmountRow label="Corpus at FI" amount={result.corpusAtFi} masked={masked} />
                <AmountRow label="Target at FI (inflation-adjusted)" amount={result.targetAtFi} masked={masked} />
              </>
            ) : (
              <ResultRow label="Years to FI" value="Not reached in 70 yrs — invest more" />
            )}
          </ResultCard>
          {result.yearsToFi === null && (
            <Text className="text-xs rounded-lg p-3" style={{ color: '#d97706', backgroundColor: '#fffbeb' }}>
              At this savings rate, inflation outpaces your corpus growth toward the target. Try increasing your monthly
              investment or expected return.
            </Text>
          )}
        </>
      )}
    </View>
  );
}
