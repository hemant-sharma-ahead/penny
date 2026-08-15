import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { ParsedRow } from '@/core/import/importParsers';
import type { RowOverride } from '@/core/import/importPipeline';
import { TileRowList } from './TileRowList';

interface SkippedGroupTileProps {
  label: string;
  rows: { row: ParsedRow; index: number }[];
  rowOverrides: Map<number, RowOverride>;
  /** Reopens `ImportCategorizeModal` for this group, pre-populated with its current ('skip') decision —
   *  the same standing kind-picker override every other tile has (redesign doc §3/§11: the full picker
   *  is never removed or replaced with a narrower per-tile surface). */
  onRecategorize: () => void;
}

/** "Skipped" bucket tile (2026-08-14, redesign §9.3, Issue #3) — a real, visible peer to Needs-input/
 *  Staged/Already-imported, using the muted (not warning/success) tone the mockup's `.tile.skip` treatment
 *  shows, plus the tile's already-fully-editable re-categorize flow (no new edit mechanism needed, just
 *  discoverability — `skippedCount` was already computed in `useImport.ts` but never surfaced before). */
export function SkippedGroupTile({ label, rows, rowOverrides, onRecategorize }: SkippedGroupTileProps) {
  const theme = useThemeColors();
  const [expanded, setExpanded] = useState(false);

  return (
    <View className="rounded-xl overflow-hidden border border-theme">
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        className="p-3 flex-row items-center gap-2"
        style={{ backgroundColor: tint(theme.neutral, 10) }}
      >
        <Text className="text-xs font-semibold text-primary flex-1" numberOfLines={1}>
          &quot;{label}&quot;
        </Text>
        <Icon name="ti-arrow-right" size={12} color={theme.textTertiary} />
        <Text className="text-xs font-semibold text-tertiary">Skip</Text>
        <View className="rounded-full bg-surface-3 px-1.5 py-0.5 flex-shrink-0">
          <Text className="text-[9.5px] font-bold text-secondary">
            {rows.length} txn{rows.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <Icon name={expanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} color={theme.textTertiary} />
      </Pressable>
      {expanded && (
        <View className="border-t border-theme px-3 py-2.5" style={{ backgroundColor: theme.surface }}>
          <TileRowList rows={rows} rowOverrides={rowOverrides} />
        </View>
      )}
      <View className="border-t border-theme px-3 py-2.5" style={{ backgroundColor: theme.surface }}>
        <Pressable onPress={onRecategorize} className="flex-row items-center justify-center gap-1.5">
          <Icon name="ti-category" size={12} color={theme.textSecondary} />
          <Text className="text-[11px] font-semibold text-secondary">Recategorize instead ›</Text>
        </Pressable>
      </View>
    </View>
  );
}
