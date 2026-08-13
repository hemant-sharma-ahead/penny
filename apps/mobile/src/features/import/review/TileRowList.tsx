import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { RowCheckbox } from '~/components/shared';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatCurrency } from '@/lib/formatters';
import type { ParsedRow } from '@/core/import/importParsers';
import type { RowOverride } from '@/core/import/importPipeline';

function fmtShortDate(epoch: number): string {
  return new Date(epoch).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export interface TileRowListSelection {
  /** Opt-out model (2026-08-13, review redesign issue #1/#9) — a row is checked iff its index is NOT
   *  in this set. Starting empty means every row starts checked, matching Bank Import's
   *  `UnmatchedBucket.tsx` "everything checked, track the exceptions" convention. Entirely decoupled
   *  from what's currently rendered (the render cap below) — `onToggleAll` always covers every one of
   *  `rows`, not just the visible slice. */
  uncheckedIndices: Set<number>;
  onToggleRow: (index: number) => void;
  onToggleAll: () => void;
}

interface TileRowListProps {
  /** Each row paired with its ORIGINAL index into `parsedRows` — see `PreviewSection.tsx`'s doc comment
   *  on why this identity has to travel with the row through every regrouping. */
  rows: { row: ParsedRow; index: number }[];
  rowOverrides: Map<number, RowOverride>;
  /** Omit entirely to render a plain, non-selectable row list (no checkboxes, no master toggle) — used
   *  by the "Already imported" duplicates bucket, which has nothing to bulk-act on. */
  selection?: TileRowListSelection;
  /** Extra per-row caption appended after the date/account line — used by the duplicates bucket for
   *  "same date, amount & description as a logged expense". */
  captionForRow?: (row: ParsedRow, index: number) => string | undefined;
}

const RENDER_CAP = 8;

/**
 * Shared row-list rendering for the Expense Import review screen (2026-08-13, review redesign) —
 * factored out of `CategoryTile.tsx` so the same checkbox/duplicate-caption/render-cap treatment isn't
 * triplicated across `CategoryTile.tsx`, `MovedRowsTile.tsx` (the new synthetic "moved rows landed here"
 * tile, issue #5), and `DuplicatesBucket.tsx` (the new "Already imported" bucket, issue #3). Render-cap
 * (first 8 + "show all") is a pure display/performance concern, per docs/ARCHITECTURE.md's
 * unbounded-`.map()`-over-bulk-data rule — entirely decoupled from `selection`, which always covers
 * every row in `rows` regardless of how many are actually rendered (issue #9's fix).
 */
export function TileRowList({ rows, rowOverrides, selection, captionForRow }: TileRowListProps) {
  const theme = useThemeColors();
  const [showAllRows, setShowAllRows] = useState(false);

  if (rows.length === 0) return null;

  const uncheckedIndices = selection?.uncheckedIndices;
  const allChecked = !!selection && (uncheckedIndices?.size ?? 0) === 0;
  const visibleRows = showAllRows ? rows : rows.slice(0, RENDER_CAP);

  return (
    <View>
      {selection && rows.length > 1 && (
        <Pressable onPress={selection.onToggleAll} className="flex-row items-center gap-2 pb-1.5">
          <RowCheckbox checked={allChecked} />
          <Text className="text-[10.5px] font-semibold text-secondary">
            {allChecked ? 'Unselect all' : 'Select all'}
          </Text>
        </Pressable>
      )}
      {rows.length > RENDER_CAP && (
        <Text className="text-[9px] text-tertiary" style={{ marginBottom: 3 }}>
          {visibleRows.length} of {rows.length} rows shown
        </Text>
      )}
      {visibleRows.map(({ row, index }, i) => {
        const override = rowOverrides.get(index);
        const isChecked = uncheckedIndices ? !uncheckedIndices.has(index) : undefined;
        const caption = captionForRow?.(row, index);
        const rowLine = (
          <>
            {selection && <RowCheckbox checked={!!isChecked} />}
            <View className="flex-1 min-w-0">
              <Text className="text-[11px] font-medium text-primary" numberOfLines={1}>
                {row.description}
              </Text>
              <Text className="text-[9.5px] text-tertiary" numberOfLines={1}>
                {fmtShortDate(row.date)}
                {row.account ? ` · ${row.account}` : ''}
                {override?.categoryName && (
                  <Text style={{ color: theme.primary }}> · moved to {override.categoryName}</Text>
                )}
                {override?.tag && <Text style={{ color: theme.info }}> · #{override.tag}</Text>}
                {caption && <Text> — {caption}</Text>}
              </Text>
            </View>
            <Text
              className="text-[11px] font-semibold flex-shrink-0"
              style={{ color: row.type === 'income' ? theme.success : theme.textPrimary }}
            >
              {row.type === 'income' ? '+' : ''}
              {formatCurrency(row.amount)}
            </Text>
          </>
        );
        const rowClassName = `flex-row items-center gap-2 py-1.5 ${i > 0 ? 'border-t border-theme' : ''}`;
        return selection ? (
          <Pressable key={index} onPress={() => selection.onToggleRow(index)} className={rowClassName}>
            {rowLine}
          </Pressable>
        ) : (
          <View key={index} className={rowClassName}>
            {rowLine}
          </View>
        );
      })}
      {rows.length > RENDER_CAP && (
        <Pressable onPress={() => setShowAllRows((v) => !v)}>
          <Text className="text-center text-[9.5px] font-semibold pt-1.5" style={{ color: theme.primary }}>
            {showAllRows ? 'Show fewer' : `+ ${rows.length - RENDER_CAP} more`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
