import { useState } from 'react';
import { View, Text } from 'react-native';
import { formatCurrency, formatMonthsDuration } from '@/lib/formatters';
import { buildLoanPlanExport } from '@/core/loans/planExport';
import { Card, SectionLabel, Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useToast } from '~/context/ToastContext';
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
 * Restored (post-Track-4), but currently BLOCKED by a real bundler gap — not working on-device yet, do
 * not consider this shipped. Web's "Download XLSX" button was originally dropped as a capability gap (no
 * native file-save/share flow existed at the time) — the intended fix mirrors Expenses' CSV/ZIP export
 * exactly (`buildLoanPlanExport` for the pure data, `xlsx`'s `write()` for the workbook bytes,
 * `expo-file-system`'s `File.write()` + `expo-sharing` for the native share sheet). On-device, tapping
 * the button throws `Requiring unknown module "NNNN"` as an **uncaught** error overlay — this is a Metro
 * module-resolution failure inside `await import('xlsx')` itself, not a normal JS runtime error, so the
 * `try/catch` below does NOT intercept it (confirmed: the error overlay still appears with the catch in
 * place). `xlsx`'s CJS entry (`xlsx.js`) has `require('fs')`/`require('stream')` calls Metro's static
 * bundler tries to resolve regardless of the runtime guards around them; stubbing those Node builtins
 * via `metro.config.js`'s `resolver.extraNodeModules` did NOT fix it either (tried and reverted), meaning
 * at least one further require in `xlsx`'s dependency chain isn't a plain string literal Metro can
 * statically stub, and the failure happens below the level any in-app error handling can reach. Not
 * root-caused further given the depth of Metro-internals work that would need — needs either a different
 * XLSX-writing library (lighter, RN-targeted) or dedicated Metro bundling investigation before this
 * button will actually work. Left wired (not reverted) since the surrounding code — `buildLoanPlanExport`
 * call, `File`/`expo-sharing` plumbing — is correct and reusable once the `xlsx` import itself is fixed.
 */
export function PlannerResults({ planner, masked }: PlannerResultsProps) {
  const theme = useThemeColors();
  const { planParams, baseline, result, interestSaved, monthsSaved, hasAccelerators } = planner;
  const { showToast } = useToast();
  const [exporting, setExporting] = useState(false);

  async function downloadXlsx() {
    if (result.rows.length === 0 || exporting) return;
    setExporting(true);
    try {
      const data = buildLoanPlanExport(planParams, baseline, result, interestSaved, monthsSaved);
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.aoa_to_sheet(data.summaryRows);
      XLSX.utils.book_append_sheet(wb, ws1, 'Summary');
      const ws2 = XLSX.utils.aoa_to_sheet([data.scheduleHeader, ...data.scheduleRows]);
      ws2['!cols'] = data.scheduleColWidths.map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws2, 'Schedule');
      const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

      const { File, Paths } = await import('expo-file-system');
      const file = new File(Paths.cache, data.filename);
      file.write(new Uint8Array(bytes));

      const Sharing = await import('expo-sharing');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
      }
    } catch {
      showToast({ message: "Couldn't export the plan. Please try again." });
    } finally {
      setExporting(false);
    }
  }

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
          <Button
            variant="primary"
            fullWidth
            icon="ti-table-down"
            loading={exporting}
            disabled={result.rows.length === 0}
            onPress={() => void downloadXlsx()}
            className="mt-4"
          >
            Download XLSX
          </Button>
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
