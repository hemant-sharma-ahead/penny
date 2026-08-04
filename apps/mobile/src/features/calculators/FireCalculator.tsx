import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { calcFire } from '@/core/calculators/fire';
import { calcRetirementProjection } from '@/core/calculators/retirementProjection';
import { useProfile } from '@/hooks/useProfile';
import { useRetirementPlan } from '@/hooks/useRetirementPlan';
import { deriveAge } from '@/lib/date';
import { usePrivacy } from '~/context/PrivacyContext';
import { useInvestableCorpus } from '~/hooks/useInvestableCorpus';
import { useTrailingLivingSpend } from '~/hooks/useTrailingLivingSpend';
import { LabeledInput, ResultCard, ResultRow, AmountRow, HeroResult } from './CalcUI';

/** Read-modify-write buffer for one `RetirementPlan` field: displays the live plan value until the
 *  user types something in this session, after which their own edit always wins (same pattern this
 *  file already used for age before the plan existed) — every keystroke commits back to the shared
 *  plan via `onCommit`, matching this app's save-on-change convention for simple settings fields. */
function usePlanField(planValue: number | undefined, fallback: string, onCommit: (n: number) => void) {
  const [override, setOverride] = useState<string | null>(null);
  const value = override ?? (planValue !== undefined ? String(planValue) : fallback);
  const onChange = (v: string) => {
    setOverride(v);
    const n = parseFloat(v);
    if (Number.isFinite(n)) onCommit(n);
  };
  return [value, onChange] as const;
}

/**
 * RN port of apps/web-react/src/features/calculators/FireCalculator.tsx. Since the Retirement Corpus
 * Home card shipped, every input here (other than age, which is derived live from the profile the same
 * as before) reads from and writes to the single shared `RetirementPlan` — editing here updates Home's
 * card too, and vice versa (see `~/hooks/useRetirementPlan.ts`). "Current corpus" and "Monthly expenses"
 * still prefill from a live derived default (investable corpus / trailing actual spend) with the user's
 * own edit always winning, same as age always has.
 */
export function FireCalculator() {
  // Calculator output (salary/income-derived figures) is always-sensitive in Safe mode, matching web's
  // MaskedValue (masks whenever mode is 'safe' or 'privacy', regardless of any per-field flag) — pass
  // `true`, not `false`; `shouldMask(false)` would leave Safe mode fully unmasked here.
  const masked = usePrivacy().shouldMask(true);
  // Age is pre-filled from the profile's DOB but the user's own input always wins.
  const { profile } = useProfile();
  const derivedAge = profile?.dob ? deriveAge(profile.dob) : null;
  const [ageOverride, setAgeOverride] = useState<string | null>(null);
  const currentAge = ageOverride ?? (derivedAge !== null ? String(derivedAge) : '30');

  const { plan, update } = useRetirementPlan();
  const liveCorpus = useInvestableCorpus();
  const trailingLiving = useTrailingLivingSpend();

  const [corpusOverride, setCorpusOverride] = useState<string | null>(null);
  const currentCorpus = corpusOverride ?? (liveCorpus !== null ? String(Math.round(liveCorpus)) : '');

  const monthlyExpenseDefault = plan?.monthlyExpenseOverride ?? trailingLiving ?? undefined;
  const [monthlyExpenseOverrideText, setMonthlyExpenseOverrideText] = useState<string | null>(null);
  const monthlyExpenses =
    monthlyExpenseOverrideText ??
    (monthlyExpenseDefault !== undefined ? String(Math.round(monthlyExpenseDefault)) : '');
  const handleMonthlyExpensesChange = (v: string) => {
    setMonthlyExpenseOverrideText(v);
    const n = parseFloat(v);
    if (Number.isFinite(n) && n >= 0) update({ monthlyExpenseOverride: n });
  };

  const [monthlyInvestment, setMonthlyInvestment] = usePlanField(plan?.monthlyInvestment, '', (n) =>
    update({ monthlyInvestment: n })
  );
  const [expectedReturn, setExpectedReturn] = usePlanField(plan?.expectedReturnPct, '12', (n) =>
    update({ expectedReturnPct: n })
  );
  const [inflation, setInflation] = usePlanField(plan?.inflationPct, '6', (n) => update({ inflationPct: n }));
  const [swr, setSwr] = usePlanField(plan?.swrPct, '4', (n) => update({ swrPct: n }));
  const [retirementAge, setRetirementAge] = usePlanField(plan?.retirementAge, '60', (n) =>
    update({ retirementAge: Math.round(n) })
  );

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

  // The new, complementary lens: funded % by the *planned* retirement age (a fixed target), rather
  // than "years to FI at current pace" — both are valid, neither replaces the other.
  const fixedYearResult = useMemo(() => {
    const age = parseFloat(currentAge);
    const exp = parseFloat(monthlyExpenses);
    const retireAge = parseFloat(retirementAge);
    if (!(age >= 0) || !(exp > 0) || !(retireAge > age)) return null;
    return calcRetirementProjection({
      currentAge: age,
      retirementAge: retireAge,
      investableCorpusToday: parseFloat(currentCorpus) || 0,
      monthlyExpenseToday: exp,
      monthlyInvestment: parseFloat(monthlyInvestment) || 0,
      expectedReturnPct: parseFloat(expectedReturn) || 0,
      inflationPct: parseFloat(inflation) || 0,
      swrPct: parseFloat(swr) || 0
    });
  }, [currentAge, monthlyExpenses, retirementAge, currentCorpus, monthlyInvestment, expectedReturn, inflation, swr]);

  return (
    <View className="gap-4">
      <View className="rounded-2xl p-4 gap-4 bg-surface border border-theme">
        <LabeledInput label="Current age" value={currentAge} onChange={setAgeOverride} suffix="yrs" placeholder="30" />
        <LabeledInput
          label="Retirement age"
          hint="shared with your Home Retirement Corpus card"
          value={retirementAge}
          onChange={setRetirementAge}
          suffix="yrs"
          placeholder="60"
        />
        <LabeledInput
          label="Monthly expenses (today)"
          hint="defaults to your trailing actual spend"
          value={monthlyExpenses}
          onChange={handleMonthlyExpensesChange}
          prefix="₹"
          placeholder="e.g. 50,000"
        />
        <LabeledInput
          label="Current corpus"
          hint="already invested — defaults to your live investable corpus"
          value={currentCorpus}
          onChange={setCorpusOverride}
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
          <ResultCard title="Projection — years to FI at current pace">
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

      {fixedYearResult && (
        <ResultCard title={`Funded by your planned retirement age (${retirementAge})`}>
          <ResultRow
            label="% funded at your planned retirement age"
            value={`${fixedYearResult.percentFunded}%`}
            accent
          />
          <AmountRow label="Corpus needed" amount={fixedYearResult.corpusNeeded} masked={masked} />
          <AmountRow label="Corpus projected" amount={fixedYearResult.corpusProjected} masked={masked} />
          {fixedYearResult.monthlyGapToClose > 0 ? (
            <AmountRow
              label="Extra monthly SIP to close the gap"
              amount={fixedYearResult.monthlyGapToClose}
              masked={masked}
            />
          ) : (
            <ResultRow label="Extra monthly SIP to close the gap" value="On track 🎉" saving />
          )}
        </ResultCard>
      )}
    </View>
  );
}
