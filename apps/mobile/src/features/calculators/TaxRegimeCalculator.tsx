import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { compareTaxRegimes, TAX_FY_LABEL, type RegimeBreakdown } from '@/core/calculators/taxRegime';
import { formatCurrency } from '@/lib/formatters';
import { usePrivacy } from '~/context/PrivacyContext';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { LabeledInput, SegmentedToggle, ResultCard, AmountRow } from './CalcUI';

function RegimeColumn({
  name,
  data,
  winner,
  masked
}: {
  name: string;
  data: RegimeBreakdown;
  winner: boolean;
  masked: boolean;
}) {
  const theme = useThemeColors();
  return (
    <View
      className="flex-1 rounded-2xl p-3 border"
      style={{
        borderColor: winner ? theme.primary : theme.border,
        backgroundColor: winner ? tint(theme.primary, 8) : undefined
      }}
    >
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-xs font-semibold text-primary">{name}</Text>
        {winner && (
          <Text
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-white"
            style={{ backgroundColor: theme.primary }}
          >
            LOWER
          </Text>
        )}
      </View>
      <Text className="text-lg font-semibold text-primary">{masked ? '••••' : formatCurrency(data.totalTax)}</Text>
      <Text className="text-[10px] text-tertiary mt-0.5">total tax</Text>
    </View>
  );
}

/** RN port of apps/web-react/src/features/calculators/TaxRegimeCalculator.tsx. */
export function TaxRegimeCalculator() {
  const theme = useThemeColors();
  // Calculator output (salary/income-derived figures) is always-sensitive in Safe mode, matching web's
  // MaskedValue (masks whenever mode is 'safe' or 'privacy', regardless of any per-field flag) — pass
  // `true`, not `false`; `shouldMask(false)` would leave Safe mode fully unmasked here.
  const masked = usePrivacy().shouldMask(true);
  const [gross, setGross] = useState('');
  const [salaried, setSalaried] = useState<'yes' | 'no'>('yes');
  const [d80c, setD80c] = useState('');
  const [d80d, setD80d] = useState('');
  const [homeLoan, setHomeLoan] = useState('');
  const [nps, setNps] = useState('');
  const [hra, setHra] = useState('');
  const [other, setOther] = useState('');

  const result = useMemo(() => {
    const g = parseFloat(gross);
    if (!(g > 0)) return null;
    return compareTaxRegimes({
      grossIncome: g,
      isSalaried: salaried === 'yes',
      deduction80C: parseFloat(d80c) || 0,
      deduction80D: parseFloat(d80d) || 0,
      homeLoanInterest: parseFloat(homeLoan) || 0,
      nps80ccd1b: parseFloat(nps) || 0,
      hraExemption: parseFloat(hra) || 0,
      otherDeductions: parseFloat(other) || 0
    });
  }, [gross, salaried, d80c, d80d, homeLoan, nps, hra, other]);

  return (
    <View className="gap-4">
      <Text className="text-[11px] text-tertiary -mb-1">{TAX_FY_LABEL} · individuals below 60</Text>

      <View className="rounded-2xl p-4 gap-4 bg-surface border border-theme">
        <LabeledInput
          label="Gross annual income"
          value={gross}
          onChange={setGross}
          prefix="₹"
          placeholder="e.g. 15,00,000"
        />
        <SegmentedToggle
          label="Salaried?"
          value={salaried}
          onChange={setSalaried}
          options={[
            { value: 'yes', label: 'Yes (std. deduction)' },
            { value: 'no', label: 'No' }
          ]}
        />

        <View className="pt-1">
          <Text className="text-[11px] font-semibold uppercase tracking-wider text-tertiary mb-3">
            Old-regime deductions
          </Text>
          <View className="gap-4">
            <LabeledInput label="80C (max ₹1.5L)" value={d80c} onChange={setD80c} prefix="₹" placeholder="0" />
            <LabeledInput label="80D — health insurance" value={d80d} onChange={setD80d} prefix="₹" placeholder="0" />
            <LabeledInput
              label="24B — home loan interest (max ₹2L)"
              value={homeLoan}
              onChange={setHomeLoan}
              prefix="₹"
              placeholder="0"
            />
            <LabeledInput label="80CCD(1B) — NPS (max ₹50K)" value={nps} onChange={setNps} prefix="₹" placeholder="0" />
            <LabeledInput label="HRA exemption" value={hra} onChange={setHra} prefix="₹" placeholder="0" />
            <LabeledInput label="Other deductions" value={other} onChange={setOther} prefix="₹" placeholder="0" />
          </View>
        </View>
      </View>

      {result && (
        <>
          <View className="flex-row gap-3">
            <RegimeColumn name="Old Regime" data={result.old} winner={result.recommended === 'old'} masked={masked} />
            {result.new && (
              <RegimeColumn name="New Regime" data={result.new} winner={result.recommended === 'new'} masked={masked} />
            )}
          </View>

          <View className="rounded-2xl p-4 items-center" style={{ backgroundColor: tint(theme.primary, 10) }}>
            <Text className="text-xs text-secondary mb-1">
              {result.recommended === 'new' ? 'New regime' : 'Old regime'} saves you
            </Text>
            <Text className="text-2xl font-semibold text-primary">
              {masked ? '••••' : formatCurrency(result.savings)}
            </Text>
            <Text className="text-[11px] text-tertiary mt-1">per year</Text>
          </View>

          <ResultCard title="Old regime breakdown">
            <AmountRow label="Standard deduction" amount={result.old.standardDeduction} masked={masked} />
            <AmountRow label="Other deductions" amount={result.old.otherDeductions} masked={masked} />
            <AmountRow label="Taxable income" amount={result.old.taxableIncome} masked={masked} />
            <AmountRow label="Tax before rebate" amount={result.old.taxBeforeRebate} masked={masked} />
            {result.old.rebate > 0 && (
              <AmountRow label="§87A rebate" amount={result.old.rebate} saving masked={masked} />
            )}
            {result.old.surcharge > 0 && <AmountRow label="Surcharge" amount={result.old.surcharge} masked={masked} />}
            <AmountRow label="Cess (4%)" amount={result.old.cess} masked={masked} />
            <AmountRow label="Total tax" amount={result.old.totalTax} accent masked={masked} />
          </ResultCard>

          {result.new && (
            <ResultCard title="New regime breakdown">
              <AmountRow label="Standard deduction" amount={result.new.standardDeduction} masked={masked} />
              <AmountRow label="Taxable income" amount={result.new.taxableIncome} masked={masked} />
              <AmountRow label="Tax before rebate" amount={result.new.taxBeforeRebate} masked={masked} />
              {result.new.rebate > 0 && (
                <AmountRow label="§87A rebate" amount={result.new.rebate} saving masked={masked} />
              )}
              {result.new.surcharge > 0 && (
                <AmountRow label="Surcharge" amount={result.new.surcharge} masked={masked} />
              )}
              <AmountRow label="Cess (4%)" amount={result.new.cess} masked={masked} />
              <AmountRow label="Total tax" amount={result.new.totalTax} accent masked={masked} />
            </ResultCard>
          )}

          <Text className="text-[10px] text-tertiary leading-relaxed">
            Estimate for planning only. Excludes marginal relief on surcharge, special-rate incomes, and other edge
            cases. Verify with a tax professional before filing.
          </Text>
        </>
      )}
    </View>
  );
}
