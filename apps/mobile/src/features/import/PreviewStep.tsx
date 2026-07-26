import { View, Text } from 'react-native';
import { Button, Card } from '~/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { useThemeColors } from '~/theme/useThemeColors';
import type { PreviewRow } from '@/core/import/importPipeline';

function fmtShortDate(epoch: number): string {
  return new Date(epoch).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

interface PreviewSummaryCardProps {
  preview: PreviewRow[];
  toImport: PreviewRow[];
  unrecognisedCount: number;
  duplicateCount: number;
}

/**
 * RN port of apps/web-legacy/src/features/import/PreviewStep.tsx, split into pieces (this summary card,
 * `PreviewRowItem`, `PreviewActions` below) so `ImportPage.tsx` can assemble them around a `FlatList`
 * instead of a plain `.map()` in a `ScrollView` — bank exports commonly run hundreds of rows, flagged as
 * an unvirtualized risk in the 2026-07-26 parity sweep. Uses `theme.success`/`theme.warning` (real hex
 * values) instead of web's `STATUS` CSS-var-string constant — the same fix already applied everywhere
 * else in this migration since `STATUS.x` silently fails as an RN style value.
 */
export function PreviewSummaryCard({ preview, toImport, unrecognisedCount, duplicateCount }: PreviewSummaryCardProps) {
  const theme = useThemeColors();
  return (
    <Card padding="sm" radius="md" className="gap-1 mb-4">
      <Text className="text-sm font-semibold text-primary">{preview.length} rows found</Text>
      <View className="flex-row flex-wrap gap-x-3 gap-y-0.5">
        {toImport.length > 0 && <Text className="text-xs text-secondary">{toImport.length} to import</Text>}
        {unrecognisedCount > 0 && (
          <Text className="text-xs" style={{ color: theme.warning }}>
            {unrecognisedCount} category unrecognised → Other
          </Text>
        )}
        {duplicateCount > 0 && (
          <Text className="text-xs text-tertiary">
            {duplicateCount} duplicate{duplicateCount > 1 ? 's' : ''} skipped
          </Text>
        )}
      </View>
    </Card>
  );
}

/** Opens the rounded/bordered box `PreviewRowItem`s sit inside — split across header/rows/footer
 *  instead of a single wrapping `View` since a `FlatList` has no equivalent single element to hang
 *  `overflow-hidden rounded-xl` on (same technique as Loans' `PlannerScheduleHeader`/`Footer`). */
export function PreviewListTop() {
  return <View className="rounded-t-xl border border-b-0 border-theme bg-surface" style={{ height: 1 }} />;
}

export function PreviewListBottom() {
  return <View className="rounded-b-xl border border-t-0 border-theme bg-surface" style={{ height: 1 }} />;
}

interface PreviewRowItemProps {
  row: PreviewRow;
}

export function PreviewRowItem({ row }: PreviewRowItemProps) {
  const theme = useThemeColors();
  return (
    <View
      className="px-4 py-3 flex-row items-start gap-3 border-l border-r border-theme bg-surface"
      style={{ opacity: row.duplicate ? 0.45 : 1 }}
    >
      <View
        className="w-2 h-2 rounded-full mt-1.5"
        style={{
          backgroundColor: row.duplicate ? theme.textTertiary : row.unrecognised ? theme.warning : theme.success
        }}
      />
      <View className="flex-1">
        <View className="flex-row items-baseline justify-between gap-2">
          <Text className="text-sm font-medium text-primary flex-1" numberOfLines={1}>
            {row.description}
          </Text>
          <Text
            className="text-sm font-semibold"
            style={{
              color: row.type === 'income' ? theme.success : theme.textPrimary,
              textDecorationLine: row.duplicate ? 'line-through' : 'none'
            }}
          >
            {row.type === 'income' ? '+' : ''}
            {formatCurrency(row.amount)}
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5 mt-0.5">
          <Text className="text-xs text-tertiary">{fmtShortDate(row.date)}</Text>
          <Text className="text-tertiary text-xs">·</Text>
          <Text className="text-xs" style={{ color: row.unrecognised ? theme.warning : theme.textSecondary }}>
            {row.matchedCategoryName}
            {row.unrecognised && ' (unrecognised)'}
          </Text>
          {row.duplicate && (
            <>
              <Text className="text-tertiary text-xs">·</Text>
              <Text className="text-xs text-tertiary">duplicate</Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

interface PreviewActionsProps {
  toImport: PreviewRow[];
  importing: boolean;
  onBack: () => void;
  onImport: () => void;
}

export function PreviewActions({ toImport, importing, onBack, onImport }: PreviewActionsProps) {
  return (
    <View className="flex-row gap-3 pt-4 pb-4">
      <Button variant="secondary" className="flex-1" onPress={onBack}>
        Back
      </Button>
      <Button
        variant="primary"
        className="flex-[2]"
        loading={importing}
        disabled={importing || toImport.length === 0}
        onPress={onImport}
      >
        {importing ? 'Importing…' : `Import ${toImport.length} expense${toImport.length !== 1 ? 's' : ''}`}
      </Button>
    </View>
  );
}
