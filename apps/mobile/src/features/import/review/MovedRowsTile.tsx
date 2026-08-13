import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { TextInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { ParsedRow } from '@/core/import/importParsers';
import type { RowOverride } from '@/core/import/importPipeline';
import { TileRowList } from './TileRowList';

interface MovedRowsTileProps {
  /** The destination category's name (`RowOverride.categoryName`) — this tile has no source name of
   *  its own, since its rows can originate from any number of different source categories. */
  categoryName: string;
  rows: { row: ParsedRow; index: number }[];
  rowOverrides: Map<number, RowOverride>;
  /** Bulk row-level tag action (index-based, not sourceName-based — see `RowOverride`'s doc comment) —
   *  the only bulk action this tile supports. There is deliberately no group-level "Tag all
   *  transactions" field (this tile has no single source category to hang a group-wide tag off —
   *  `categoryTags` is keyed by sourceName) and no bulk-move action (out of this fix's scope — see
   *  docs/mockups/proposals/expense-import-review-redesign-v1.html §5). */
  onTagRows: (rowIndices: number[], tag: string) => void;
}

/**
 * Lightweight synthetic tile (2026-08-13, review redesign issue #5) for a destination category that a
 * row-level "move to…" override landed rows into, but which has no `CategoryResolution` of its own (no
 * existing source-category tile already resolves there). Rendered by `PreviewSection.tsx` for each key
 * in `groupRowsIntoTiles`' `syntheticTiles` map. Deliberately has NO resolution controls (no kind
 * picker, no transfer/create fields) — it isn't a source-category resolution, just "here's where these
 * moved rows live now" — and is always 'ready' (a row-level override is itself an explicit decision;
 * mirrors `rowTriage`'s existing `rowOverrides.has(i) → 'ready'` rule).
 */
export function MovedRowsTile({ categoryName, rows, rowOverrides, onTagRows }: MovedRowsTileProps) {
  const theme = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const [uncheckedIndices, setUncheckedIndices] = useState<Set<number>>(new Set());

  const checkedIndices = rows.map((r) => r.index).filter((i) => !uncheckedIndices.has(i));
  const selectedCount = checkedIndices.length;
  const hasPartialSelection = selectedCount > 0 && selectedCount < rows.length;
  const selectedTags = new Set(checkedIndices.map((i) => rowOverrides.get(i)?.tag ?? ''));
  const bulkTagValue = selectedTags.size === 1 ? ([...selectedTags][0] ?? '') : '';

  function toggleRow(index: number) {
    setUncheckedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleAll() {
    setUncheckedIndices((prev) => (prev.size === 0 ? new Set(rows.map((r) => r.index)) : new Set()));
  }

  return (
    <View className="rounded-xl overflow-hidden border border-theme">
      {/* Header background carries the status tint; body below is explicitly neutral (2026-08-13, same
       *  header-only-color scoping as `CategoryTile.tsx` — see that file's doc comment). */}
      <View className="p-3 gap-2" style={{ backgroundColor: tint(theme.success, 10) }}>
        <Pressable onPress={() => setExpanded((e) => !e)} className="flex-row items-center gap-2">
          <Text className="text-xs font-semibold text-primary flex-shrink" numberOfLines={1}>
            &quot;{categoryName}&quot;
          </Text>
          <Text className="text-[9.5px] text-tertiary" numberOfLines={1}>
            (new, from a moved row)
          </Text>
          <View className="flex-1" />
          <View className="rounded-full bg-surface-3 px-1.5 py-0.5 flex-shrink-0">
            <Text className="text-[9.5px] font-bold text-secondary">
              {rows.length} txn{rows.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <Icon name={expanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} color={theme.textTertiary} />
        </Pressable>
        {hasPartialSelection && (
          <TextInput
            placeholder={`Tag ${selectedCount} selected`}
            value={bulkTagValue}
            onChange={(v) => onTagRows(checkedIndices, v)}
            inputClassName="!rounded-full !py-1.5 !text-xs text-center"
          />
        )}
      </View>
      {expanded && (
        <View className="border-t border-theme px-3 py-2.5" style={{ backgroundColor: theme.surface }}>
          <TileRowList
            rows={rows}
            rowOverrides={rowOverrides}
            selection={{ uncheckedIndices, onToggleRow: toggleRow, onToggleAll: toggleAll }}
          />
        </View>
      )}
    </View>
  );
}
