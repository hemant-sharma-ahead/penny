import { useState } from 'react';
import { View, Text } from 'react-native';
import { formatCurrency, formatMonthsDuration } from '@/lib/formatters';
import { buildLoanPlanExport } from '@/core/loans/planExport';
import type { AmortizationRow } from '@/core/loans/amortization';
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

interface PlannerSummaryCardProps {
  planner: ReturnType<typeof usePlanner>;
  masked: boolean;
}

/**
 * Web's "Download XLSX" button was originally dropped as a capability gap (no native file-save/share
 * flow existed at the time), then restored post-Track-4 on the same `xlsx` package web uses — which
 * turned out not to work on-device at all: `xlsx`'s CJS entry has `require('fs')`/`require('stream')`
 * calls Metro's static bundler tries to resolve regardless of runtime guards, failing below the level
 * any in-app `try/catch` can reach (`Requiring unknown module "NNNN"`, an uncaught error overlay).
 * Stubbing the Node builtins via `metro.config.js`'s `resolver.extraNodeModules` didn't fix it either.
 * Switched to `write-excel-file`'s `/universal` entry point instead, which depends only on `fflate`
 * (a pure-JS zip implementation, no Node builtins) — it bundles clean under Metro. It returns a `Blob`
 * (browser-oriented API) rather than raw bytes, so `Response(blob).arrayBuffer()` — RN's `fetch`
 * polyfill already implements `Response` over its own `Blob`, so this conversion works without a
 * dedicated native module — bridges to the same `File.write(Uint8Array)` + `expo-sharing` flow
 * Expenses' CSV/ZIP export already established.
 */
export function PlannerSummaryCard({ planner, masked }: PlannerSummaryCardProps) {
  const { planParams, baseline, result, interestSaved, monthsSaved, hasAccelerators } = planner;
  const { showToast } = useToast();
  const [exporting, setExporting] = useState(false);

  async function downloadXlsx() {
    if (result.rows.length === 0 || exporting) return;
    setExporting(true);
    try {
      const data = buildLoanPlanExport(planParams, baseline, result, interestSaved, monthsSaved);
      const { default: writeXlsxFile } = await import('write-excel-file/universal');
      const blob = await writeXlsxFile(
        [
          { data: data.summaryRows, sheet: 'Summary' },
          {
            data: [data.scheduleHeader, ...data.scheduleRows],
            sheet: 'Schedule',
            columns: data.scheduleColWidths.map((width) => ({ width }))
          }
        ],
        { fontFamily: 'Calibri', fontSize: 11 }
      ).toBlob();
      const bytes = new Uint8Array(await new Response(blob).arrayBuffer());

      const { File, Paths } = await import('expo-file-system');
      const file = new File(Paths.cache, data.filename);
      file.write(bytes);

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
  );
}

/** Column-header row for the amortization schedule — rendered once above the virtualized rows
 *  (see `PlannerScheduleRow` below and `PlannerTab.tsx`'s `FlatList`, which owns the schedule's
 *  scrolling instead of nesting it inside the page's own `ScrollView` — found unvirtualized at
 *  240-360 rows for a 20-30yr loan in the 2026-07-26 parity sweep). */
export function PlannerScheduleHeader() {
  return (
    <View>
      <SectionLabel>Amortization Schedule</SectionLabel>
      <View className="flex-row px-3 py-2 rounded-t-2xl border border-b-0 border-theme bg-surface-2">
        <Text className="w-8 text-[10px] font-semibold text-tertiary uppercase">#</Text>
        <Text className="w-16 text-[10px] font-semibold text-tertiary uppercase">Date</Text>
        <Text className="flex-1 text-right text-[10px] font-semibold text-tertiary uppercase">EMI</Text>
        <Text className="flex-1 text-right text-[10px] font-semibold text-tertiary uppercase">Principal</Text>
        <Text className="flex-1 text-right text-[10px] font-semibold text-tertiary uppercase">Interest</Text>
        <Text className="flex-1 text-right text-[10px] font-semibold text-tertiary uppercase">Balance</Text>
      </View>
    </View>
  );
}

/** Closes the rounded-bottom border the header opens (see `PlannerScheduleHeader`) — a `FlatList`
 *  has no single wrapping element to hang `overflow-hidden rounded-2xl` on the way the old `.map()`'d
 *  `View` did, so the rounding is split between header/footer instead; the middle rows only need a
 *  bottom border, matching the visual result closely enough. */
export function PlannerScheduleFooter({ isLast }: { isLast: boolean }) {
  return <View className={`h-2 border-l border-r border-theme ${isLast ? 'rounded-b-2xl border-b' : ''}`} />;
}

interface PlannerScheduleRowProps {
  row: AmortizationRow;
  masked: boolean;
}

export function PlannerScheduleRow({ row: r, masked }: PlannerScheduleRowProps) {
  const theme = useThemeColors();
  return (
    <View className="border-l border-r border-theme bg-surface">
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
        <Text className="flex-1 text-right text-xs text-secondary">{masked ? '••' : formatCurrency(r.principal)}</Text>
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
  );
}
