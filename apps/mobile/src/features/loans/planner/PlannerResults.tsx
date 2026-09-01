import { useState } from 'react';
import { View, Text, Platform } from 'react-native';
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
 * flow existed at the time), then restored post-Track-4 on `write-excel-file`'s `/universal` entry
 * point (depends only on `fflate`, a pure-JS zip implementation — chosen specifically because the
 * `xlsx` package's CJS entry was believed to fail to bundle under Metro at the time). That belief
 * turned out to be wrong for the READ path (`core/bank-import/xlsxParser.ts`, 2026-08-05, verified via
 * a real `expo export --platform android` — bundles clean), but `write-excel-file` itself still failed
 * on-device with a *different*, previously-undiagnosed bug (found 2026-08-05 via the actual error
 * message, once the bare `catch {}` below was changed to surface it): `.toBlob()` always ends by
 * calling `new Blob([arrayBuffer], {...})` internally — but RN's own `Blob` (`Libraries/Blob/
 * BlobManager.js`) explicitly does not support constructing a Blob from an `ArrayBuffer`/
 * `ArrayBufferView` ("Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported"), so
 * this call always threw, on every platform, every time — the export button never actually worked.
 *
 * Fixed by switching to the `xlsx` package for writing too (matching the read side) — its `write()`
 * with `{ type: 'array' }` returns the file's raw bytes directly (no `Blob` involved at all in that
 * code path, confirmed by reading `xlsx.js`'s `writeSync()`: `type: 'array'` converts a plain binary
 * string via a pure-JS `s2ab()`, never touching `fs`/`stream`/`Blob`), so native can `file.write()`
 * those bytes straight away — no `Response`/`Blob` round-trip needed at all anymore. Web still
 * constructs a real `Blob` for the `<a download>` flow (a real browser `Blob` has no trouble with
 * `ArrayBuffer` parts — this limitation is RN-only). One real trade-off: the free/community `xlsx`
 * build has no cell-styling support, so the `fontFamily`/`fontSize` styling `write-excel-file` used to
 * apply is gone — the data and column widths are unaffected, just the font is Excel's own default now.
 *
 * Second bug, same day: `xlsx`'s `write()` with `type: 'array'` actually returns a bare `ArrayBuffer`
 * (its own `s2ab()` helper builds a `Uint8Array` view internally but returns the underlying buffer, not
 * the view — its TS types say `Uint8Array` regardless), and `expo-file-system`'s native `File.write()`
 * needs an actual `TypedArray` to read the buffer off of via its JSI bridge — passed a bare
 * `ArrayBuffer` instead, it threw `[write] Cannot convert '[object ArrayBuffer]' to a Kotlin type. no
 * ArrayBuffer attached`. Fixed by explicitly wrapping the result in `new Uint8Array(...)` before it
 * reaches either `new Blob(...)` (web) or `file.write(...)` (native).
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
      const { utils, write } = await import('xlsx');
      const workbook = utils.book_new();
      utils.book_append_sheet(workbook, utils.aoa_to_sheet(data.summaryRows), 'Summary');
      const scheduleSheet = utils.aoa_to_sheet([data.scheduleHeader, ...data.scheduleRows]);
      scheduleSheet['!cols'] = data.scheduleColWidths.map((wch) => ({ wch }));
      utils.book_append_sheet(workbook, scheduleSheet, 'Schedule');
      // `xlsx`'s `write()` with `type: 'array'` actually returns a bare `ArrayBuffer` (see its own
      // `s2ab()` helper — allocates an `ArrayBuffer`, writes into a `Uint8Array` view of it, then
      // returns the buffer itself, not the view), despite the type declaring `Uint8Array`. Passing
      // that raw `ArrayBuffer` straight to `expo-file-system`'s native `File.write()` is what actually
      // threw `[write] Cannot convert '[object ArrayBuffer]' to a Kotlin type. no ArrayBuffer attached`
      // (2026-08-05) — its JSI bridge expects a genuine `TypedArray` object to read the buffer off of,
      // not a bare `ArrayBuffer`. Wrapping it in a real `Uint8Array` here fixes both this and the
      // earlier RN-`Blob`-from-`ArrayBuffer` bug in one place.
      const bytes = new Uint8Array(write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);

      if (Platform.OS === 'web') {
        const blob = new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const { File, Paths } = await import('expo-file-system');
        const file = new File(Paths.cache, data.filename);
        // `File.write()` is async (`Promise<void>`) — this used to fire the share sheet without waiting
        // for the write to land, racing a real disk write against `shareAsync` (found 2026-08-21
        // investigating backup restore failures; same missing-`await` bug, independently, in several
        // other native export flows — see `AutoBackupCard.tsx`'s fix note for the full writeup).
        await file.write(bytes);

        const Sharing = await import('expo-sharing');
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          });
        }
      }
    } catch (err) {
      // Surfaces the real cause instead of a bare generic message (same convention as
      // `BackupPage.tsx`'s restore-error handling) — the previous silent catch made this exact
      // export failure impossible to diagnose without adding temporary logging first.
      const detail = err instanceof Error ? err.message : String(err);
      showToast({ message: `Couldn't export the plan: ${detail}` });
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
