import { Fragment } from 'react';
import { View, Pressable, ScrollView, Text } from 'react-native';
import { RowCheckbox } from '~/components/shared';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatCurrency } from '@/lib/formatters';
import type { ParsedRow } from '@/core/import/importParsers';
import type { RowOverride } from '@/core/import/importPipeline';

/** Year-inclusive (2026-08-14, CSV-import redesign §9.2/Issue #2) — matches `CarryForwardExcluded.tsx`'s
 *  own `fmtShortDate`, which already had `year: 'numeric'`. This copy was missing it. */
function fmtShortDate(epoch: number): string {
  return new Date(epoch).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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
  /** A quiet, inline per-row action link (2026-08-14, redesign §8/Issue #7) — used by
   *  `DuplicatesBucket.tsx`'s "not a duplicate — import anyway". Deliberately a link, not a full button:
   *  this bucket is meant to stay low-friction to skim through. */
  actionForRow?: (row: ParsedRow, index: number) => { label: string; onPress: () => void } | undefined;
}

/** Hard render cap — generous (unlike the collapsed "+N more" toggle this replaces) since the list is
 *  now always internally-scrolling rather than needing a full expand to see past it, but still a REAL
 *  cap, never literally unbounded — same `docs/ARCHITECTURE.md` "unbounded `.map()` over bulk data" rule
 *  that already caused a real on-device crash elsewhere in this codebase (`UnparsedRows.tsx`'s own
 *  20-row cap exists for the identical reason). */
const RENDER_CAP = 60;
/** Fixed max-height for the scrollable container (2026-08-14, CSV-import redesign §9.2/Issue #2) —
 *  replaces the old "+N more" unbounded expand (`showAllRows(true)` used to render EVERY row via an
 *  unbounded `.map()`, the same shape of bug that already caused a real on-device crash elsewhere in
 *  this same PR). No expand toggle needed at all now — the list itself scrolls within this box. */
const SCROLL_MAX_HEIGHT = 260;

/**
 * Shared row-list rendering for the Expense Import review screen (2026-08-13, review redesign) —
 * factored out of `CategoryTile.tsx` so the same checkbox/duplicate-caption/render-cap treatment isn't
 * triplicated across `CategoryTile.tsx`, `MovedRowsTile.tsx` (the new synthetic "moved rows landed here"
 * tile, issue #5), and `DuplicatesBucket.tsx` (the new "Already imported" bucket, issue #3). The render
 * cap is decoupled from `selection`, which always covers every row in `rows` regardless of how many are
 * actually rendered (issue #9's fix).
 */
export function TileRowList({ rows, rowOverrides, selection, captionForRow, actionForRow }: TileRowListProps) {
  const theme = useThemeColors();

  if (rows.length === 0) return null;

  const uncheckedIndices = selection?.uncheckedIndices;
  const allChecked = !!selection && (uncheckedIndices?.size ?? 0) === 0;
  const visibleRows = rows.slice(0, RENDER_CAP);
  const needsScroll = rows.length > 4;

  const listContent = visibleRows.map(({ row, index }, i) => {
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
    const rowClassName = `flex-row items-center gap-2 pt-1.5 ${i > 0 ? 'border-t border-theme' : ''}`;
    const action = actionForRow?.(row, index);
    return (
      <Fragment key={index}>
        {selection ? (
          <Pressable onPress={() => selection.onToggleRow(index)} className={rowClassName}>
            {rowLine}
          </Pressable>
        ) : (
          <View className={rowClassName}>{rowLine}</View>
        )}
        {action && (
          <Pressable onPress={action.onPress} className="pb-1.5 pl-0.5" hitSlop={4}>
            <Text className="text-[9.5px] font-semibold" style={{ color: theme.info }}>
              {action.label}
            </Text>
          </Pressable>
        )}
      </Fragment>
    );
  });

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
      {needsScroll ? (
        <ScrollView style={{ maxHeight: SCROLL_MAX_HEIGHT }} nestedScrollEnabled showsVerticalScrollIndicator>
          {listContent}
        </ScrollView>
      ) : (
        listContent
      )}
      {rows.length > RENDER_CAP ? (
        <Text className="text-center text-[9px] text-tertiary" style={{ paddingTop: 6 }}>
          {rows.length} rows total · showing first {RENDER_CAP}
        </Text>
      ) : (
        needsScroll && (
          <Text className="text-center text-[9px] text-tertiary" style={{ paddingTop: 6 }}>
            {rows.length} rows total · scroll for more
          </Text>
        )
      )}
    </View>
  );
}
