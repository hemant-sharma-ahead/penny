import { View, Text } from 'react-native';
import { formatCurrency, formatMonthsDuration } from '@/lib/formatters';
import { Card, SectionLabel } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { usePlanner } from './usePlanner';

interface CompareRowProps {
  label: string;
  original: string;
  withPlan: string;
  saving?: boolean;
}
function CompareRow({ label, original, withPlan, saving }: CompareRowProps) {
  const theme = useThemeColors();
  return (
    <View className="flex-row items-center gap-2 py-1.5 border-b border-theme">
      <Text className="flex-1 text-xs text-secondary">{label}</Text>
      <Text className="w-24 text-right text-xs font-medium text-primary">{original}</Text>
      <Text className="w-24 text-right text-xs font-semibold" style={{ color: saving ? theme.success : theme.primary }}>
        {withPlan}
      </Text>
    </View>
  );
}

interface PlannerResultsProps {
  planner: ReturnType<typeof usePlanner>;
  masked: boolean;
}

/**
 * RN port note: web's "Download XLSX" button is dropped — it lazy-loads the `xlsx` package and calls
 * its browser-only `writeFile` (triggers a DOM download), which has no RN equivalent without a native
 * file-save/share flow that hasn't been built for this migration (same "no export" scope as the
 * PDF/HTML export already listed in docs/plans/mobile-migration.md's "Explicitly out of scope"). The
 * amortization table's CSS Grid (`gridTemplateColumns`) has no Yoga equivalent — rebuilt as a `flex-row`
 * with fixed-width `#`/`Date` columns and `flex-1` amount columns.
 */
export function PlannerResults({ planner, masked }: PlannerResultsProps) {
  const theme = useThemeColors();
  const { baseline, result, interestSaved, monthsSaved, hasAccelerators } = planner;

  return (
    <>
      {/* Summary card */}
      <View>
        <SectionLabel>Summary</SectionLabel>
        <Card>
          <View className="flex-row items-center gap-2 pb-1.5 mb-0.5">
            <View className="flex-1" />
            <Text className="w-24 text-right text-[10px] font-semibold text-tertiary uppercase">Original</Text>
            <Text className="w-24 text-right text-[10px] font-semibold text-tertiary uppercase">With plan</Text>
          </View>
          <CompareRow
            label="Tenure"
            original={formatMonthsDuration(baseline.actualTenureMonths)}
            withPlan={formatMonthsDuration(result.actualTenureMonths)}
          />
          <CompareRow
            label="Total interest"
            original={masked ? '••••' : formatCurrency(baseline.totalInterest)}
            withPlan={masked ? '••••' : formatCurrency(result.totalInterest)}
          />
          <CompareRow
            label="Total paid"
            original={masked ? '••••' : formatCurrency(baseline.totalEmiPaid)}
            withPlan={masked ? '••••' : formatCurrency(result.totalEmiPaid + result.totalPrepayment)}
          />
          {result.totalPrepayment > 0 && (
            <CompareRow
              label="Total prepayment"
              original="—"
              withPlan={masked ? '••••' : formatCurrency(result.totalPrepayment)}
            />
          )}
          {hasAccelerators && (
            <>
              <CompareRow
                label="Interest saved"
                original="—"
                withPlan={masked ? '••••' : formatCurrency(interestSaved)}
                saving
              />
              <CompareRow label="Months saved" original="—" withPlan={formatMonthsDuration(monthsSaved)} saving />
            </>
          )}
        </Card>
      </View>

      {/* Amortization table */}
      <View>
        <SectionLabel>Amortization Schedule</SectionLabel>
        <View className="bg-surface rounded-2xl overflow-hidden border border-theme">
          <View className="flex-row px-3 py-2 border-b border-theme bg-surface-2">
            <Text className="w-8 text-[10px] font-semibold text-tertiary uppercase">#</Text>
            <Text className="w-16 text-[10px] font-semibold text-tertiary uppercase">Date</Text>
            <Text className="flex-1 text-right text-[10px] font-semibold text-tertiary uppercase">EMI</Text>
            <Text className="flex-1 text-right text-[10px] font-semibold text-tertiary uppercase">Principal</Text>
            <Text className="flex-1 text-right text-[10px] font-semibold text-tertiary uppercase">Interest</Text>
            <Text className="flex-1 text-right text-[10px] font-semibold text-tertiary uppercase">Balance</Text>
          </View>

          {result.rows.map((r) => (
            <View key={r.month}>
              <View
                className="flex-row px-3 py-2 border-b border-theme"
                style={{ backgroundColor: r.prepayment > 0 ? theme.surfaceSecondary : undefined }}
              >
                <Text className="w-8 text-xs text-tertiary">{r.month}</Text>
                <Text className="w-16 text-xs text-tertiary" numberOfLines={1}>
                  {r.date}
                </Text>
                <Text className="flex-1 text-right text-xs text-primary font-medium">
                  {masked ? '••' : formatCurrency(r.emi)}
                </Text>
                <Text className="flex-1 text-right text-xs text-secondary">
                  {masked ? '••' : formatCurrency(r.principal)}
                </Text>
                <Text className="flex-1 text-right text-xs" style={{ color: theme.danger }}>
                  {masked ? '••' : formatCurrency(r.interest)}
                </Text>
                <Text className="flex-1 text-right text-xs text-primary">
                  {masked ? '••' : formatCurrency(r.closingBalance)}
                </Text>
              </View>
              {r.prepayment > 0 && (
                <View
                  className="flex-row items-center justify-between px-3 py-1 border-b border-theme"
                  style={{ backgroundColor: theme.surfaceSecondary }}
                >
                  <View className="flex-row items-center gap-1">
                    <Icon name="ti-arrow-down-circle" size={11} color={theme.success} />
                    <Text className="text-[10px] font-medium" style={{ color: theme.success }}>
                      Prepayment
                    </Text>
                  </View>
                  <Text className="text-[10px] font-semibold" style={{ color: theme.success }}>
                    {masked ? '••••' : `− ${formatCurrency(r.prepayment)}`}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
      </View>
    </>
  );
}
