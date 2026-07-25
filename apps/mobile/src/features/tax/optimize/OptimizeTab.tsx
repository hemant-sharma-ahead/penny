import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import RNSlider from '@react-native-community/slider';
import { Card, StatBox, Banner, SectionLabel, ProgressBar, Toggle, Badge } from '~/components/ui';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Profile } from '@/core/db/types';
import type { TaxSummary } from '@/core/tax/calculator';
import { compareTaxRegimes, CURRENT_FY_CONFIG } from '@/core/calculators/taxRegime';
import { optimizeDirectTax, DONATION_TIERS, DEDUCTION_LIMITS } from '@/core/tax/optimizer';
import { suggestITR, ITR5_NOTE, HUF_ELIGIBILITY, type ITRAnswers } from '@/core/tax/itrAdvisor';
import type { useTaxDeductions } from '../deductions/useTaxDeductions';

interface Props {
  summary: TaxSummary;
  deductions: ReturnType<typeof useTaxDeductions>;
  profile: Profile | null;
  gross: number;
}

/** RN port of web's inline `<input type=range>` "what-if" slider — `@react-native-community/slider`
 *  is a new native dependency for this pass (no equivalent slider control existed anywhere else in the
 *  mobile app). */
function Slider({
  label,
  value,
  max,
  onChange
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const theme = useThemeColors();
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-secondary">{label}</Text>
        <Text className="text-xs font-semibold text-primary">{formatCurrency(value)}</Text>
      </View>
      <RNSlider
        minimumValue={0}
        maximumValue={max}
        step={5000}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={theme.primary}
        maximumTrackTintColor={theme.border}
        thumbTintColor={theme.primary}
      />
    </View>
  );
}

/** RN port of apps/web-legacy/src/features/tax/optimize/OptimizeTab.tsx. */
export function OptimizeTab({ summary, deductions, profile, gross }: Props) {
  const theme = useThemeColors();
  const isSalaried = profile?.employmentType === 'salaried';
  const used80C = deductions.total80C;
  const used80D = deductions.total80D.self + deductions.total80D.parents;
  const usedNps = deductions.npsAmount;
  const homeLoanInterest = summary.sec24B.annualInterest;

  const opt = useMemo(
    () =>
      optimizeDirectTax({
        grossIncome: gross,
        isSalaried,
        used80C,
        used80D,
        usedNps,
        homeLoanInterest,
        hraExemption: 0,
        fyConfig: CURRENT_FY_CONFIG
      }),
    [gross, isSalaried, used80C, used80D, usedNps, homeLoanInterest]
  );

  // What-if simulator state, seeded from actuals.
  const [s80c, setS80c] = useState(Math.min(used80C, DEDUCTION_LIMITS.SEC_80C));
  const [s80d, setS80d] = useState(Math.min(used80D, DEDUCTION_LIMITS.SEC_80D));
  const [sNps, setSNps] = useState(Math.min(usedNps, DEDUCTION_LIMITS.NPS_80CCD_1B));

  const whatIf = useMemo(
    () =>
      compareTaxRegimes(
        {
          grossIncome: gross,
          isSalaried,
          deduction80C: s80c,
          deduction80D: s80d,
          homeLoanInterest,
          nps80ccd1b: sNps,
          hraExemption: 0,
          otherDeductions: 0
        },
        CURRENT_FY_CONFIG
      ),
    [gross, isSalaried, s80c, s80d, sNps, homeLoanInterest]
  );

  // ITR helper state.
  const [itr, setItr] = useState<ITRAnswers>({
    isHUF: false,
    hasBusinessOrProfession: false,
    isPresumptive: false,
    hasCapitalGains: summary.capGains.length > 0,
    multipleHouseProperties: false,
    incomeAbove50L: gross > 50_00_000,
    foreignAssetsOrIncome: false
  });
  const itrResult = suggestITR(itr);

  if (gross <= 0) {
    return (
      <Banner variant="info" icon="ti-bulb">
        Add your income (on the Footprint tab) to get personalised tax-saving suggestions, a regime recommendation, and
        an ITR-form pointer.
      </Banner>
    );
  }

  return (
    <>
      {/* Regime recommendation */}
      <Card className="gap-3">
        <SectionLabel className="">Best regime for you</SectionLabel>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <StatBox
              tone={opt.recommendedRegime === 'new' ? 'info' : 'success'}
              label="Recommended"
              value={opt.recommendedRegime === 'new' ? 'New regime' : 'Old regime'}
            />
          </View>
          <View className="flex-1">
            <StatBox label="Saves vs the other" value={formatCurrency(Math.round(opt.regimeSaving))} sub="per year" />
          </View>
        </View>
        {opt.notes.map((n) => (
          <Banner key={n} variant="info" icon="ti-info-circle">
            {n}
          </Banner>
        ))}
      </Card>

      {/* Deduction headroom */}
      <Card className="gap-3">
        <View className="flex-row items-center justify-between">
          <SectionLabel className="">Deduction headroom</SectionLabel>
          {opt.deductionsHelp && opt.totalPotentialSaving > 0 && (
            <Badge label={`Save up to ${formatCurrency(opt.totalPotentialSaving)}`} color={theme.success} size="sm" />
          )}
        </View>
        {opt.headroom.map((h) => (
          <View key={h.section} className="gap-1">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-primary font-medium">
                {h.section} · {formatCurrency(h.used)} / {formatCurrency(h.limit)}
              </Text>
              {h.remaining > 0 ? (
                <Text className="text-xs text-secondary">
                  {formatCurrency(h.remaining)} left
                  {h.potentialSaving > 0 && (
                    <Text style={{ color: theme.success }}> · save {formatCurrency(h.potentialSaving)}</Text>
                  )}
                </Text>
              ) : (
                <Text className="text-xs" style={{ color: theme.success }}>
                  Maxed ✓
                </Text>
              )}
            </View>
            <ProgressBar value={h.limit > 0 ? (h.used / h.limit) * 100 : 0} />
            <Text className="text-[10px] text-tertiary">{h.label}</Text>
          </View>
        ))}
        {!opt.deductionsHelp && (
          <Text className="text-[11px] text-tertiary">
            Marginal rate {formatPercent(opt.marginalRatePct)} — but you're on the new regime, so these don't reduce tax
            unless you switch.
          </Text>
        )}
      </Card>

      {/* What-if simulator */}
      <Card className="gap-3">
        <SectionLabel className="">What if I invest more?</SectionLabel>
        <Slider label="80C (PPF/ELSS/EPF…)" value={s80c} max={DEDUCTION_LIMITS.SEC_80C} onChange={setS80c} />
        <Slider label="80D (health insurance)" value={s80d} max={DEDUCTION_LIMITS.SEC_80D} onChange={setS80d} />
        <Slider label="80CCD(1B) (extra NPS)" value={sNps} max={DEDUCTION_LIMITS.NPS_80CCD_1B} onChange={setSNps} />
        <View className="flex-row gap-3 pt-1">
          <View className="flex-1">
            <StatBox size="sm" label="Old regime tax" value={formatCurrency(Math.round(whatIf?.old.totalTax ?? 0))} />
          </View>
          <View className="flex-1">
            <StatBox
              size="sm"
              label="New regime tax"
              value={whatIf?.new ? formatCurrency(Math.round(whatIf.new.totalTax)) : '—'}
            />
          </View>
        </View>
        <Banner variant="success" icon="ti-coin">
          With these deductions, the {whatIf?.recommended === 'new' ? 'new' : 'old'} regime is cheaper
          {whatIf && whatIf.savings > 0 ? ` by ${formatCurrency(Math.round(whatIf.savings))}/yr` : ''}.
        </Banner>
      </Card>

      {/* 80G donations */}
      <Card className="gap-2">
        <SectionLabel className="">Donations (80G)</SectionLabel>
        <Text className="text-[11px] text-secondary">
          Donations are deductible at 100% or 50%, some capped at 10% of adjusted gross income. Old regime only.
        </Text>
        {DONATION_TIERS.map((t, i) => (
          <View
            key={i}
            className={`flex-row items-start justify-between gap-3 py-1.5 ${i > 0 ? 'border-t border-theme' : ''}`}
          >
            <Text className="text-[11px] text-secondary flex-1">{t.examples}</Text>
            <View className="items-end">
              <Badge label={t.rate} color={t.rate === '100%' ? theme.success : theme.info} size="sm" />
              {t.limited && <Text className="text-[9px] text-tertiary mt-0.5">10% GTI cap</Text>}
            </View>
          </View>
        ))}
      </Card>

      {/* ITR helper */}
      <Card className="gap-3">
        <SectionLabel className="">Which ITR form?</SectionLabel>
        {(
          [
            ['hasBusinessOrProfession', 'Business / professional income'],
            ['isPresumptive', 'Using presumptive scheme (44AD/ADA)'],
            ['hasCapitalGains', 'Capital gains (stocks, property, gold)'],
            ['multipleHouseProperties', 'More than one house property'],
            ['incomeAbove50L', 'Total income above ₹50L'],
            ['foreignAssetsOrIncome', 'Foreign assets or income'],
            ['isHUF', 'Filing as a HUF']
          ] as [keyof ITRAnswers, string][]
        ).map(([key, label]) => (
          <View key={key} className="flex-row items-center justify-between">
            <Text className="text-xs text-secondary">{label}</Text>
            <Toggle value={itr[key]} onChange={(v) => setItr((prev) => ({ ...prev, [key]: v }))} />
          </View>
        ))}
        <View className="rounded-xl p-3 bg-surface-2 border border-theme gap-1">
          <Text className="text-sm font-bold text-primary">{itrResult.form}</Text>
          <Text className="text-[11px] text-secondary">{itrResult.why}</Text>
          <Text className="text-[10px] text-tertiary">Can report: {itrResult.claimable.join(' · ')}</Text>
        </View>
        <Text className="text-[10px] text-tertiary">{ITR5_NOTE}</Text>
      </Card>

      {/* HUF eligibility */}
      <Card className="gap-2">
        <SectionLabel className="">{HUF_ELIGIBILITY.title}</SectionLabel>
        <View className="gap-1.5">
          {HUF_ELIGIBILITY.points.map((p) => (
            <View key={p} className="flex-row gap-2">
              <Text className="text-[11px]" style={{ color: theme.info }}>
                •
              </Text>
              <Text className="text-[11px] text-secondary leading-relaxed flex-1">{p}</Text>
            </View>
          ))}
        </View>
        <Banner variant="success" icon="ti-users-group">
          {HUF_ELIGIBILITY.benefit}
        </Banner>
      </Card>

      {/* ITR upload — coming soon */}
      <Banner variant="info" icon="ti-file-upload">
        Coming soon: upload last year's ITR to get an automatic review of what you could have saved. For now, the
        suggestions above use your Penny data.
      </Banner>

      <View className="rounded-xl p-3 bg-surface-2 border border-theme">
        <Text className="text-[10px] leading-relaxed text-tertiary">
          Note: Planning estimates, not filing advice. Saving figures assume the old regime and your marginal slab.
          Confirm eligibility and limits with a CA.
        </Text>
      </View>
    </>
  );
}
