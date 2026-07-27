import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { calcHraExemption } from '@/core/calculators/hra';
import { usePrivacy } from '~/context/PrivacyContext';
import { LabeledInput, SegmentedToggle, ResultCard, AmountRow, HeroResult } from './CalcUI';

/** RN port of apps/web-react/src/features/calculators/HraCalculator.tsx. */
export function HraCalculator() {
  // Calculator output (salary/income-derived figures) is always-sensitive in Safe mode, matching web's
  // MaskedValue (masks whenever mode is 'safe' or 'privacy', regardless of any per-field flag) — pass
  // `true`, not `false`; `shouldMask(false)` would leave Safe mode fully unmasked here.
  const masked = usePrivacy().shouldMask(true);
  const [basic, setBasic] = useState('');
  const [hra, setHra] = useState('');
  const [rent, setRent] = useState('');
  const [metro, setMetro] = useState<'metro' | 'non-metro'>('metro');

  const result = useMemo(() => {
    const b = parseFloat(basic);
    const h = parseFloat(hra);
    const r = parseFloat(rent);
    if (!(b > 0) || !(h >= 0) || !(r >= 0)) return null;
    return calcHraExemption({ basicSalary: b, hraReceived: h, rentPaid: r, isMetro: metro === 'metro' });
  }, [basic, hra, rent, metro]);

  return (
    <View className="gap-4">
      <View className="rounded-2xl p-4 gap-4 bg-surface border border-theme">
        <LabeledInput
          label="Basic salary + DA (annual)"
          value={basic}
          onChange={setBasic}
          prefix="₹"
          placeholder="e.g. 6,00,000"
        />
        <LabeledInput
          label="HRA received (annual)"
          value={hra}
          onChange={setHra}
          prefix="₹"
          placeholder="e.g. 3,00,000"
        />
        <LabeledInput
          label="Rent paid (annual)"
          value={rent}
          onChange={setRent}
          prefix="₹"
          placeholder="e.g. 3,60,000"
        />
        <SegmentedToggle
          label="City type"
          value={metro}
          onChange={setMetro}
          options={[
            { value: 'metro', label: 'Metro (50%)' },
            { value: 'non-metro', label: 'Non-metro (40%)' }
          ]}
        />
      </View>

      {result && (
        <>
          <HeroResult label="HRA exemption (tax-free)" amount={result.exemption} masked={masked} />
          <ResultCard title="The least of these three applies">
            <AmountRow label="1. Actual HRA received" amount={result.actualHra} masked={masked} />
            <AmountRow
              label={`2. ${metro === 'metro' ? '50%' : '40%'} of Basic + DA`}
              amount={result.percentOfBasic}
              masked={masked}
            />
            <AmountRow label="3. Rent paid − 10% of Basic" amount={result.rentMinus10Pct} masked={masked} />
          </ResultCard>
          <ResultCard title="Outcome">
            <AmountRow label="Exempt from tax" amount={result.exemption} saving masked={masked} />
            <AmountRow label="Taxable HRA" amount={result.taxableHra} accent masked={masked} />
          </ResultCard>
        </>
      )}
    </View>
  );
}
