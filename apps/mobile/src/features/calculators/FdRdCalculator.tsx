import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { calcFd, calcRd, type CompoundingFreq } from '@/core/calculators/fdRd';
import { usePrivacy } from '~/context/PrivacyContext';
import { LabeledInput, SegmentedToggle, ResultCard, AmountRow, HeroResult } from './CalcUI';

/** RN port of apps/web-react/src/features/calculators/FdRdCalculator.tsx. */
export function FdRdCalculator() {
  const masked = usePrivacy().shouldMask(false);
  const [mode, setMode] = useState<'fd' | 'rd'>('fd');

  // FD inputs
  const [principal, setPrincipal] = useState('');
  const [fdRate, setFdRate] = useState('7');
  const [fdYears, setFdYears] = useState('5');
  const [freq, setFreq] = useState<CompoundingFreq>('quarterly');

  // RD inputs
  const [installment, setInstallment] = useState('');
  const [rdRate, setRdRate] = useState('7');
  const [rdMonths, setRdMonths] = useState('60');

  const fdResult = useMemo(() => {
    if (mode !== 'fd') return null;
    const p = parseFloat(principal);
    const y = parseFloat(fdYears);
    if (!(p > 0) || !(y > 0)) return null;
    return calcFd({ principal: p, ratePct: parseFloat(fdRate) || 0, years: y, freq });
  }, [mode, principal, fdRate, fdYears, freq]);

  const rdResult = useMemo(() => {
    if (mode !== 'rd') return null;
    const i = parseFloat(installment);
    const m = parseFloat(rdMonths);
    if (!(i > 0) || !(m > 0)) return null;
    return calcRd({ monthlyInstallment: i, ratePct: parseFloat(rdRate) || 0, months: m });
  }, [mode, installment, rdRate, rdMonths]);

  return (
    <View className="gap-4">
      <View className="rounded-2xl p-4 gap-4 bg-surface">
        <SegmentedToggle
          label="Deposit type"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'fd', label: 'Fixed (FD)' },
            { value: 'rd', label: 'Recurring (RD)' }
          ]}
        />

        {mode === 'fd' ? (
          <>
            <LabeledInput
              label="Principal amount"
              value={principal}
              onChange={setPrincipal}
              prefix="₹"
              placeholder="e.g. 1,00,000"
            />
            <LabeledInput label="Interest rate" value={fdRate} onChange={setFdRate} suffix="%" placeholder="7" />
            <LabeledInput label="Tenure" value={fdYears} onChange={setFdYears} suffix="yrs" placeholder="5" />
            <SegmentedToggle
              label="Compounding"
              value={freq}
              onChange={setFreq}
              options={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'quarterly', label: 'Quarterly' },
                { value: 'half-yearly', label: 'Half-yr' },
                { value: 'yearly', label: 'Yearly' }
              ]}
            />
          </>
        ) : (
          <>
            <LabeledInput
              label="Monthly installment"
              value={installment}
              onChange={setInstallment}
              prefix="₹"
              placeholder="e.g. 5,000"
            />
            <LabeledInput label="Interest rate" value={rdRate} onChange={setRdRate} suffix="%" placeholder="7" />
            <LabeledInput
              label="Tenure"
              hint="number of months"
              value={rdMonths}
              onChange={setRdMonths}
              suffix="mo"
              placeholder="60"
            />
          </>
        )}
      </View>

      {mode === 'fd' && fdResult && (
        <>
          <HeroResult
            label="Maturity amount"
            amount={fdResult.maturityAmount}
            note={`after ${fdYears} years`}
            masked={masked}
          />
          <ResultCard title="Breakdown">
            <AmountRow label="Principal invested" amount={fdResult.principal} masked={masked} />
            <AmountRow label="Interest earned" amount={fdResult.totalInterest} saving masked={masked} />
            <AmountRow label="Maturity value" amount={fdResult.maturityAmount} accent masked={masked} />
          </ResultCard>
        </>
      )}

      {mode === 'rd' && rdResult && (
        <>
          <HeroResult
            label="Maturity amount"
            amount={rdResult.maturityAmount}
            note={`after ${rdMonths} months`}
            masked={masked}
          />
          <ResultCard title="Breakdown">
            <AmountRow label="Total deposited" amount={rdResult.totalDeposited} masked={masked} />
            <AmountRow label="Interest earned" amount={rdResult.totalInterest} saving masked={masked} />
            <AmountRow label="Maturity value" amount={rdResult.maturityAmount} accent masked={masked} />
          </ResultCard>
        </>
      )}
    </View>
  );
}
