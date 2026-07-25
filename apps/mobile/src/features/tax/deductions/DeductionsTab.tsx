import { View, Text } from 'react-native';
import { DetailRow } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatCurrency } from '@/lib/formatters';
import { LIMITS } from '@/core/tax/calculator';
import type { TaxSummary } from '@/core/tax/calculator';
import { DeductionBar } from './DeductionBar';
import { ManualInput } from './ManualInput';
import type { useTaxDeductions } from './useTaxDeductions';

interface DeductionsTabProps {
  summary: TaxSummary;
  deductions: ReturnType<typeof useTaxDeductions>;
}

/** RN port of apps/web-legacy/src/features/tax/deductions/DeductionsTab.tsx. */
export function DeductionsTab({ summary, deductions }: DeductionsTabProps) {
  const theme = useThemeColors();
  const { sec24B } = summary;
  const { total80C, npsAmount, total80D } = deductions;

  return (
    <>
      {/* 80C */}
      <View className="rounded-2xl p-4 gap-4 bg-surface">
        <View>
          <Text className="text-sm font-semibold text-primary">Section 80C</Text>
          <Text className="text-xs text-tertiary">Tax-saving investments (max ₹1,50,000)</Text>
        </View>

        <DeductionBar used={total80C} limit={LIMITS.SEC_80C} label="80C utilisation" />

        {summary.inferred80C.length > 0 && (
          <View className="gap-1.5">
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">From your data</Text>
            {summary.inferred80C.map((item) => (
              <DetailRow
                key={item.label}
                label={
                  <View className="flex-row items-center gap-1">
                    <Icon name="ti-check" size={11} color={theme.success} />
                    <Text className="text-xs text-secondary">{item.label}</Text>
                  </View>
                }
                value={formatCurrency(item.amount)}
                size="md"
              />
            ))}
          </View>
        )}

        <View className="gap-2.5">
          <Text className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">Add your investments</Text>
          <ManualInput label="PPF contribution" value={deductions.ppf} onChange={deductions.setPpf} />
          <ManualInput label="ELSS mutual funds" value={deductions.elss} onChange={deductions.setElss} />
          <ManualInput label="NPS (80C portion)" value={deductions.nps} onChange={deductions.setNps} />
          <ManualInput
            label="Other (ULIP, NSC, SSY, etc.)"
            value={deductions.other80C}
            onChange={deductions.setOther80C}
          />
        </View>
      </View>

      {/* NPS 80CCD(1B) additional */}
      {npsAmount > 0 && (
        <View
          className="rounded-2xl p-4 gap-3"
          style={{ backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#e0e7ff' }}
        >
          <View>
            <Text className="text-sm font-semibold text-primary">Section 80CCD(1B) — NPS bonus</Text>
            <Text className="text-xs text-tertiary">Additional ₹50,000 over 80C limit</Text>
          </View>
          <DeductionBar used={Math.min(npsAmount, LIMITS.NPS_80CCD_1B)} limit={LIMITS.NPS_80CCD_1B} label="80CCD(1B)" />
        </View>
      )}

      {/* 80D */}
      <View className="rounded-2xl p-4 gap-4 bg-surface">
        <View>
          <Text className="text-sm font-semibold text-primary">Section 80D</Text>
          <Text className="text-xs text-tertiary">Health insurance premiums (max ₹25,000 self + ₹25,000 parents)</Text>
        </View>

        <DeductionBar used={total80D.self} limit={LIMITS.SEC_80D_SELF} label="Self & family" />

        {summary.inferred80DAmount > 0 && (
          <DetailRow
            label={
              <View className="flex-row items-center gap-1">
                <Icon name="ti-check" size={11} color={theme.success} />
                <Text className="text-xs text-secondary">Health insurance premium</Text>
              </View>
            }
            value={formatCurrency(summary.inferred80DAmount)}
            size="md"
          />
        )}

        <View>
          <Text className="text-[10px] font-semibold uppercase tracking-wide mb-2 text-tertiary">Parents</Text>
          <DeductionBar used={total80D.parents} limit={LIMITS.SEC_80D_PARENTS} label="Parents' health insurance" />
          <View className="mt-2">
            <ManualInput
              label="Parents' health premium"
              value={deductions.parentsPremium}
              onChange={deductions.setParentsPremium}
            />
          </View>
        </View>
      </View>

      {/* 24B */}
      <View className="rounded-2xl p-4 gap-4 bg-surface">
        <View>
          <Text className="text-sm font-semibold text-primary">Section 24B</Text>
          <Text className="text-xs text-tertiary">Home loan interest deduction (max ₹2,00,000)</Text>
        </View>

        {sec24B.hasHomeLoan ? (
          <>
            <DeductionBar
              used={Math.min(sec24B.annualInterest, LIMITS.SEC_24B)}
              limit={LIMITS.SEC_24B}
              label="Home loan interest"
            />
            <Text className="text-xs text-secondary">
              Estimated annual interest: {formatCurrency(sec24B.annualInterest)}
              {sec24B.annualInterest > LIMITS.SEC_24B && (
                <Text style={{ color: theme.warning }}> (capped at ₹2L for self-occupied property)</Text>
              )}
            </Text>
          </>
        ) : (
          <Text className="text-sm text-tertiary">
            No home loan found. Add one under Liabilities to track this deduction.
          </Text>
        )}
      </View>

      {/* Old vs New regime note */}
      <View className="rounded-2xl p-4 bg-surface-2 border border-theme">
        <Text className="text-xs font-semibold mb-1 text-secondary">Old vs. New Regime</Text>
        <Text className="text-xs leading-relaxed text-secondary">
          Deductions (80C/80D/24B) apply under the old tax regime. Under the new regime these are unavailable but slab
          rates are lower. Compare both before filing — this tool covers old-regime deductions only.
        </Text>
      </View>
    </>
  );
}
