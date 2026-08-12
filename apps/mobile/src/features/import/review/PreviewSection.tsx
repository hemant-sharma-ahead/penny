import { useCallback, useMemo, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { SectionLabel } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Account, ExpenseCategory } from '@/core/db/types';
import type { ParsedRow, RejectedRow } from '@/core/import/importParsers';
import type { ColumnMapping } from '@/core/import/importMatcher';
import type { CategoryResolution, CategoryAction } from '@/core/import/importCategoryResolution';
import { allIntentGroups, isCategoryResolutionDecided } from '@/core/import/importCategoryResolution';
import type { RowOverride } from '@/core/import/importPipeline';
import type { DisplayTransferPair, RowTriage } from '../useImport';
import { CategoryTile } from './CategoryTile';
import { TransferPairCard } from './TransferPairCard';
import { UnparsedRows } from './UnparsedRows';
import { CarryForwardExcluded } from './CarryForwardExcluded';

interface PreviewSectionProps {
  rejectedRows: RejectedRow[];
  mapping: ColumnMapping | null;
  /** Original CSV header row — see `UnparsedRows`' doc comment for why this is threaded through. */
  header: string[];
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
  /** The user's real accounts — threaded through to `CategoryTile`'s "Transfer to account" picker
   *  (2026-08-09 fix). See `ReviewStep.tsx`'s doc comment on `excludeAccountId` for why the current
   *  import's own target account is filtered out by the caller before it reaches here. */
  accounts: Account[];
  /** The account this import is writing into, if there's a single unambiguous one (a whole-file
   *  `noAccountColumn` import) — excluded from every tile's "Transfer to account" options so a
   *  transfer can never be picked to credit the very account it's also debiting from. `undefined` for a
   *  per-row multi-account CSV, where no single account applies to every tile — see `ReviewStep.tsx`. */
  excludeAccountId: string | undefined;
  /** Per-category existing-transaction counts — passed straight through to `CategoryTile` →
   *  `CategoryPickerModal`'s "Frequent" quick-pick row. See `useImport.ts`'s doc comment. */
  txnCountByCategory: Map<string, number>;
  /** Per-source-category custom tag, keyed by source name (see CategoryTile's "Tag all transactions"
   *  field) — orthogonal to which category kind the source resolves to. */
  categoryTags: Map<string, string>;
  /** Per-row overrides (2026-08-06) — see `RowOverride`'s doc comment. Read here only to compute each
   *  tile's own override-affected count for its status tint; the actual per-row bulk-select UI/state
   *  lives inside `CategoryTile` itself. */
  rowOverrides: Map<number, RowOverride>;
  onUpdateCategory: (sourceName: string, suggestion: CategoryAction) => void;
  onUpdateCategoryTag: (sourceName: string, tag: string) => void;
  onMoveRowsToCategory: (rowIndices: number[], categoryId: string, categoryName: string) => void;
  onTagRows: (rowIndices: number[], tag: string) => void;
}

/** RN port of apps/web-react/src/features/import/review/PreviewSection.tsx. Section 2 of the review
 *  screen. Internal order: unparsed rows → excluded carry-forward markers → linked transfer pairs →
 *  category tiles. The rows-read/ready/attention/duplicate/actual-transactions summary lives only in
 *  the accordion header above (see ReviewStep.tsx). */
export function PreviewSection({
  rejectedRows,
  mapping,
  header,
  onFixRejected,
  carryForwardExcludedRows,
  transferPairs,
  categoryResolutions,
  categoriesDecidedCount,
  touchedCategorySources,
  parsedRows,
  rowTriage,
  categories,
  accounts,
  excludeAccountId,
  txnCountByCategory,
  categoryTags,
  rowOverrides,
  onUpdateCategory,
  onUpdateCategoryTag,
  onMoveRowsToCategory,
  onTagRows
}: PreviewSectionProps) {
  const theme = useThemeColors();
  const [transfersExpanded, setTransfersExpanded] = useState(false);
  const groupOptions = useMemo(() => allIntentGroups().map((g) => ({ value: g.key, label: g.label })), []);

  /** Any source category name already resolved ('existing') to a given real `categoryId` — the first
   *  one found, if more than one source name happens to map to the same category (an accepted,
   *  pre-existing ambiguity; there's no more-correct tile to prefer among ties). Used below to actually
   *  regroup a row-level override (`CategoryTile`'s "Move N selected to…") into wherever that target
   *  category is already shown, instead of leaving it on its original tile. */
  const tileForExistingCategoryId = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of categoryResolutions) {
      if (r.suggestion.kind === 'existing' && !map.has(r.suggestion.categoryId)) {
        map.set(r.suggestion.categoryId, r.sourceName);
      }
    }
    return map;
  }, [categoryResolutions]);

  /** A row with an active override (moved to a different EXISTING category) resolves to whichever
   *  source-category tile is already mapped to that same target category, falling back to its own
   *  source name when no such tile exists yet (a new "moved-to" tile is a real UI element of its own —
   *  out of scope for a pure regrouping fix without its own design pass, see
   *  docs/DESIGN_GUIDELINES.md). Shared by `rowsByCategory`/`statusByCategory` below so a tile's visible
   *  rows and its background-tint stats always agree on where each row actually lives. */
  const effectiveTileKey = useCallback(
    (row: ParsedRow, index: number): string => {
      const sourceKey = row.categoryName.trim() || 'Other';
      const override = rowOverrides.get(index);
      const overriddenTile = override?.categoryId ? tileForExistingCategoryId.get(override.categoryId) : undefined;
      return overriddenTile && overriddenTile !== sourceKey ? overriddenTile : sourceKey;
    },
    [rowOverrides, tileForExistingCategoryId]
  );

  /** Grouped by EFFECTIVE category tile (see `effectiveTileKey` above, 2026-08-09 fix — previously
   *  grouped by the row's own untouched source `categoryName` regardless of any row-level override,
   *  so a reassigned row stayed stuck on its original tile with only a cosmetic "moved to X" annotation
   *  underneath it, never actually regrouped). Each entry also carries its ORIGINAL index into
   *  `parsedRows` (2026-08-06), not just the row itself. `rowsByCategory`/`statusByCategory` are
   *  recomputed fresh from `parsedRows` on every render (never a stable keyed structure — see
   *  `useImport.ts`'s doc comments on why `parsedRows` is append-only, so plain array index stays a
   *  valid identity for a whole review session), so the index has to be captured here, at the one place
   *  that still has it, for `CategoryTile`'s bulk-select UI to reference later. */
  const rowsByCategory = useMemo(() => {
    const map = new Map<string, { row: ParsedRow; index: number }[]>();
    parsedRows.forEach((row, index) => {
      const key = effectiveTileKey(row, index);
      const list = map.get(key) ?? [];
      list.push({ row, index });
      map.set(key, list);
    });
    return map;
  }, [parsedRows, effectiveTileKey]);

  /** Ready/attention/duplicate counts per EFFECTIVE category tile (same regrouping as `rowsByCategory`
   *  above), from the same per-row `rowTriage` the Accounts section already uses — drives each tile's
   *  background tint. */
  const statusByCategory = useMemo(() => {
    const map = new Map<string, { ready: number; attention: number; duplicate: number }>();
    parsedRows.forEach((row, i) => {
      const key = effectiveTileKey(row, i);
      const bucket = map.get(key) ?? { ready: 0, attention: 0, duplicate: 0 };
      bucket[rowTriage[i] ?? 'ready']++;
      map.set(key, bucket);
    });
    return map;
  }, [parsedRows, rowTriage, effectiveTileKey]);

  /** Undecided tiles (still showing "Choose…") sort first, so what needs attention is immediately
   *  visible instead of buried below already-resolved tiles — original file order preserved within
   *  each group. */
  const orderedCategoryResolutions = useMemo(() => {
    return [...categoryResolutions].sort(
      (a, b) =>
        Number(isCategoryResolutionDecided(a, touchedCategorySources)) -
        Number(isCategoryResolutionDecided(b, touchedCategorySources))
    );
  }, [categoryResolutions, touchedCategorySources]);

  /** Real accounts eligible as a transfer destination for a given tile — excludes `excludeAccountId`
   *  (this import's own single target account, when there is one) so a transfer can never be pointed
   *  back at the very account it's also debiting from. See this component's own prop doc comments. */
  const transferAccountOptions = useMemo(
    () => accounts.filter((a) => a.id !== excludeAccountId),
    [accounts, excludeAccountId]
  );

  return (
    <View className="gap-3">
      {/* (a) structurally unparsed rows */}
      <UnparsedRows rejectedRows={rejectedRows} mapping={mapping} header={header} onFixRejected={onFixRejected} />

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
          const decided = isCategoryResolutionDecided(r, touchedCategorySources);
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
              transferAccountOptions={transferAccountOptions}
              txnCountByCategory={txnCountByCategory}
              groupOptions={groupOptions}
              tag={categoryTags.get(r.sourceName) ?? ''}
              rowOverrides={rowOverrides}
              onTagChange={(tag) => onUpdateCategoryTag(r.sourceName, tag)}
              onUpdate={(suggestion) => onUpdateCategory(r.sourceName, suggestion)}
              onMoveRowsToCategory={onMoveRowsToCategory}
              onTagRows={onTagRows}
            />
          );
        })}
      </View>
    </View>
  );
}
