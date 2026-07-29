import { useMemo, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { SectionLabel } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { ExpenseCategory } from '@/core/db/types';
import type { ParsedRow, RejectedRow } from '@/core/import/importParsers';
import type { ColumnMapping } from '@/core/import/importMatcher';
import type { CategoryResolution, CategoryAction } from '@/core/import/importCategoryResolution';
import { allIntentGroups } from '@/core/import/importCategoryResolution';
import type { DisplayTransferPair, RowTriage } from '../useImport';
import { CategoryTile } from './CategoryTile';
import { TransferPairCard } from './TransferPairCard';
import { UnparsedRows } from './UnparsedRows';
import { CarryForwardExcluded } from './CarryForwardExcluded';

interface PreviewSectionProps {
  rejectedRows: RejectedRow[];
  mapping: ColumnMapping | null;
  onFixRejected: (rowIndex: number, fields: { date: string; amount: string; description: string }) => boolean;
  /** Redundant MoneyView-style carry-forward markers (every occurrence but the earliest per account) —
   *  never written, but shown distinctly so they're never silently dropped. See CarryForwardExcluded. */
  carryForwardExcludedRows: ParsedRow[];
  transferPairs: DisplayTransferPair[];
  categoryResolutions: CategoryResolution[];
  categoriesDecidedCount: number;
  touchedCategorySources: Set<string>;
  parsedRows: ParsedRow[];
  rowTriage: RowTriage[];
  categories: ExpenseCategory[];
  /** Per-source-category custom tag, keyed by source name (see CategoryTile's "Tag all transactions"
   *  field) — orthogonal to which category kind the source resolves to. */
  categoryTags: Map<string, string>;
  onUpdateCategory: (sourceName: string, suggestion: CategoryAction) => void;
  onUpdateCategoryTag: (sourceName: string, tag: string) => void;
}

/** RN port of apps/web-react/src/features/import/review/PreviewSection.tsx. Section 2 of the review
 *  screen. Internal order: unparsed rows → excluded carry-forward markers → linked transfer pairs →
 *  category tiles. The rows-read/ready/attention/duplicate/actual-transactions summary lives only in
 *  the accordion header above (see ReviewStep.tsx). */
export function PreviewSection({
  rejectedRows,
  mapping,
  onFixRejected,
  carryForwardExcludedRows,
  transferPairs,
  categoryResolutions,
  categoriesDecidedCount,
  touchedCategorySources,
  parsedRows,
  rowTriage,
  categories,
  categoryTags,
  onUpdateCategory,
  onUpdateCategoryTag
}: PreviewSectionProps) {
  const theme = useThemeColors();
  const [transfersExpanded, setTransfersExpanded] = useState(false);
  const groupOptions = useMemo(() => allIntentGroups().map((g) => ({ value: g.key, label: g.label })), []);

  const rowsByCategory = useMemo(() => {
    const map = new Map<string, ParsedRow[]>();
    for (const row of parsedRows) {
      const key = row.categoryName.trim() || 'Other';
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return map;
  }, [parsedRows]);

  /** Ready/attention/duplicate counts per source category, from the same per-row `rowTriage` the
   *  Accounts section already uses — drives each tile's background tint. */
  const statusByCategory = useMemo(() => {
    const map = new Map<string, { ready: number; attention: number; duplicate: number }>();
    parsedRows.forEach((row, i) => {
      const key = row.categoryName.trim() || 'Other';
      const bucket = map.get(key) ?? { ready: 0, attention: 0, duplicate: 0 };
      bucket[rowTriage[i] ?? 'ready']++;
      map.set(key, bucket);
    });
    return map;
  }, [parsedRows, rowTriage]);

  /** Undecided tiles (still showing "Choose…") sort first, so what needs attention is immediately
   *  visible instead of buried below already-resolved tiles — original file order preserved within
   *  each group. */
  const orderedCategoryResolutions = useMemo(() => {
    const isDecided = (r: CategoryResolution) =>
      r.suggestion.kind !== 'create' || touchedCategorySources.has(r.sourceName);
    return [...categoryResolutions].sort((a, b) => Number(isDecided(a)) - Number(isDecided(b)));
  }, [categoryResolutions, touchedCategorySources]);

  return (
    <View className="gap-3">
      {/* (a) structurally unparsed rows */}
      <UnparsedRows rejectedRows={rejectedRows} mapping={mapping} onFixRejected={onFixRejected} />

      {/* (a2) redundant carry-forward markers — excluded, never silently dropped */}
      <CarryForwardExcluded rows={carryForwardExcludedRows} />

      {/* (b) linked transfer pairs — collapsed by default, like a category tile, so a file with many
       *  self-transfers doesn't push the category tiles far down the scroll. */}
      {transferPairs.length > 0 && (
        <View className="rounded-xl overflow-hidden bg-surface border border-theme">
          <Pressable
            onPress={() => setTransfersExpanded((e) => !e)}
            className="flex-row items-center justify-between gap-2 p-3"
          >
            <View className="flex-1 flex-row items-center gap-1.5">
              <Icon name="ti-arrows-left-right" size={14} color={theme.textTertiary} />
              <Text className="text-xs font-bold text-primary">Linked transfers</Text>
              <View className="bg-surface-3 rounded-full px-1.5 py-0.5">
                <Text className="text-[10px] font-bold text-secondary">{transferPairs.length}</Text>
              </View>
            </View>
            <Icon name={transfersExpanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} color={theme.textTertiary} />
          </Pressable>
          {transfersExpanded && (
            <View className="border-t border-theme px-3 pb-3 pt-2 gap-2">
              {transferPairs.map((pair, i) => (
                <View key={i} className="gap-1">
                  <TransferPairCard pair={pair} />
                  <Text className="text-center text-[9.5px] text-tertiary">
                    {pair.alreadyImported
                      ? 'Already imported — not counted or re-imported'
                      : 'Counted once in the total above'}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* (d) category tiles */}
      <View className="gap-2">
        <View className="flex-row items-center gap-1.5 mb-2">
          <SectionLabel className="mb-0">Categories</SectionLabel>
          <View className="bg-surface-3 rounded-full px-1.5 py-0.5">
            <Text className="text-[10px] font-bold text-secondary">
              {categoriesDecidedCount} of {categoryResolutions.length} decided
            </Text>
          </View>
        </View>
        {orderedCategoryResolutions.map((r) => {
          const decided = r.suggestion.kind !== 'create' || touchedCategorySources.has(r.sourceName);
          const stats = statusByCategory.get(r.sourceName);
          const allDuplicate = !!stats && stats.ready === 0 && stats.attention === 0 && stats.duplicate > 0;
          return (
            <CategoryTile
              key={r.sourceName}
              resolution={r}
              decided={decided}
              status={!decided ? 'attention' : allDuplicate ? 'duplicate' : 'ready'}
              rows={rowsByCategory.get(r.sourceName) ?? []}
              categories={categories}
              groupOptions={groupOptions}
              tag={categoryTags.get(r.sourceName) ?? ''}
              onTagChange={(tag) => onUpdateCategoryTag(r.sourceName, tag)}
              onUpdate={(suggestion) => onUpdateCategory(r.sourceName, suggestion)}
            />
          );
        })}
      </View>
    </View>
  );
}
