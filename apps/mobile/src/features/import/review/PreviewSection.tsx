import { useMemo, useState, type ReactNode } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Account, ExpenseCategory } from '@/core/db/types';
import type { ParsedRow, RejectedRow } from '@/core/import/importParsers';
import type { ColumnMapping } from '@/core/import/importMatcher';
import type { CategoryResolution, CategoryAction } from '@/core/import/importCategoryResolution';
import { allIntentGroups, isCategoryResolutionDecided } from '@/core/import/importCategoryResolution';
import type { RowOverride } from '@/core/import/importPipeline';
import { groupRowsIntoTiles } from '@/core/import/importTileGrouping';
import type { DisplayTransferPair, RowTriage } from '../useImport';
import { CategoryTile } from './CategoryTile';
import { MovedRowsTile } from './MovedRowsTile';
import { DuplicatesBucket } from './DuplicatesBucket';
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
  /** Per-row overrides (2026-08-06) — see `RowOverride`'s doc comment. Read here to compute the
   *  effective tile grouping (`groupRowsIntoTiles`) — the actual per-row bulk-select UI/state lives
   *  inside `CategoryTile`/`MovedRowsTile` themselves. */
  rowOverrides: Map<number, RowOverride>;
  /** "Remembered — {categoryName}" suggestions (2026-08-13, review redesign issue #8), keyed by source
   *  category name — see `useImport.ts`'s doc comment. */
  rememberedSuggestions: Map<string, { categoryId: string; categoryName: string }>;
  onUpdateCategory: (sourceName: string, suggestion: CategoryAction) => void;
  onUpdateCategoryTag: (sourceName: string, tag: string) => void;
  onMoveRowsToCategory: (rowIndices: number[], categoryId: string, categoryName: string) => void;
  onTagRows: (rowIndices: number[], tag: string) => void;
  /** "Looks good, create it" (2026-08-13, review redesign issue #7) — see `useImport.ts`'s
   *  `acknowledgeCategory` doc comment. */
  onAcknowledge: (sourceName: string) => void;
  /** "Not a transfer — log separately" (2026-08-13, review redesign issue #4) — see `useImport.ts`'s
   *  `unpairTransfer` doc comment. */
  onUnpairTransfer: (outgoingIndex: number, incomingIndex: number) => void;
}

/** One of the three peer readiness buckets below — used both to key `manuallyExpanded` and to compute
 *  the auto-expand cascade (2026-08-13, bucket-tiles redesign, decision #4). */
type BucketKey = 'attention' | 'ready' | 'duplicate';

/** Bordered, independently-collapsible bucket card — same colored-dot + title + count + chevron header
 *  convention as `UnmatchedBucket.tsx`'s own outer-bucket header, wrapped in the same bordered-card
 *  treatment this file's "Linked transfers" card already uses (2026-08-13, bucket-tiles redesign §5).
 *  Single-consumer (this file only), so it stays local rather than moving to `components/shared/`. */
function BucketCard({
  dotColor,
  title,
  count,
  expanded,
  onToggle,
  children
}: {
  dotColor: string;
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const theme = useThemeColors();
  return (
    <View className="rounded-xl overflow-hidden bg-surface border border-theme">
      <Pressable onPress={onToggle} className="flex-row items-center justify-between gap-2 p-3">
        <View className="flex-1 flex-row items-center gap-1.5">
          <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor }} />
          <Text className="text-sm font-semibold text-primary">{title}</Text>
          <View className="bg-surface-3 rounded-full px-1.5 py-0.5">
            <Text className="text-[10px] font-bold text-secondary">{count}</Text>
          </View>
        </View>
        <Icon name={expanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} color={theme.textTertiary} />
      </Pressable>
      {expanded && <View className="border-t border-theme px-3 pb-3 pt-2 gap-2">{children}</View>}
    </View>
  );
}

/** RN port of apps/web-react/src/features/import/review/PreviewSection.tsx. Section 2 of the review
 *  screen. Internal order: unparsed rows → excluded carry-forward markers → linked transfer pairs →
 *  three peer readiness buckets — "Needs your input" / "Staged — ready to import" / "Already imported"
 *  (2026-08-13, review redesign issue #6; promoted from plain text section labels to real bordered
 *  bucket cards in the bucket-tiles redesign, same day — see
 *  `docs/mockups/proposals/expense-import-bucket-tiles-v1.html` §5). The rows-read/ready/attention/
 *  duplicate/actual-transactions summary lives only in the accordion header above (see
 *  `ReviewStep.tsx`). */
export function PreviewSection({
  rejectedRows,
  mapping,
  header,
  onFixRejected,
  carryForwardExcludedRows,
  transferPairs,
  categoryResolutions,
  touchedCategorySources,
  parsedRows,
  rowTriage,
  categories,
  accounts,
  excludeAccountId,
  txnCountByCategory,
  categoryTags,
  rowOverrides,
  rememberedSuggestions,
  onUpdateCategory,
  onUpdateCategoryTag,
  onMoveRowsToCategory,
  onTagRows,
  onAcknowledge,
  onUnpairTransfer
}: PreviewSectionProps) {
  const theme = useThemeColors();
  const [transfersExpanded, setTransfersExpanded] = useState(false);
  const groupOptions = useMemo(() => allIntentGroups().map((g) => ({ value: g.key, label: g.label })), []);

  /** Any source category name already resolved ('existing') to a given real `categoryId` — the first
   *  one found, if more than one source name happens to map to the same category (an accepted,
   *  pre-existing ambiguity; there's no more-correct tile to prefer among ties). Used by
   *  `groupRowsIntoTiles` to regroup a row-level override ("Move N selected to…") into wherever that
   *  target category is already shown, falling back to a freshly-synthesized tile when no such tile
   *  exists yet — see `computeEffectiveTileKey`'s doc comment in packages/core. */
  const tileForExistingCategoryId = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of categoryResolutions) {
      if (r.suggestion.kind === 'existing' && !map.has(r.suggestion.categoryId)) {
        map.set(r.suggestion.categoryId, r.sourceName);
      }
    }
    return map;
  }, [categoryResolutions]);

  /** Single-pass grouping (2026-08-13, review redesign issues #3/#4/#5/#10) — excludes every
   *  transfer-paired and duplicate row from the normal category tiles entirely (never double-rendered),
   *  splits any genuinely mixed source category into homogeneous expense/income tiles, and synthesizes a
   *  fresh tile identity for a moved row with no existing resolution-backed destination. See
   *  `importTileGrouping.ts`'s doc comment for the full rules. */
  const grouping = useMemo(
    () => groupRowsIntoTiles(parsedRows, rowTriage, transferPairs, tileForExistingCategoryId, rowOverrides),
    [parsedRows, rowTriage, transferPairs, tileForExistingCategoryId, rowOverrides]
  );

  /** Real accounts eligible as a transfer destination for a given tile — excludes `excludeAccountId`
   *  (this import's own single target account, when there is one) so a transfer can never be pointed
   *  back at the very account it's also debiting from. See this component's own prop doc comments. */
  const transferAccountOptions = useMemo(
    () => accounts.filter((a) => a.id !== excludeAccountId),
    [accounts, excludeAccountId]
  );

  interface ResolutionTileItem {
    kind: 'resolution';
    key: string;
    resolution: CategoryResolution;
    typeSuffix?: 'expense' | 'income';
    rows: { row: ParsedRow; index: number }[];
    decided: boolean;
  }
  interface SyntheticTileItem {
    kind: 'synthetic';
    key: string;
    categoryId: string;
    categoryName: string;
    rows: { row: ParsedRow; index: number }[];
  }
  type TileItem = ResolutionTileItem | SyntheticTileItem;

  /** Flattens every resolution + its (0, 1, or 2 — see homogeneity) rendered tile variants, plus every
   *  synthetic moved-to tile, into one list — then partitioned into the three readiness sections below.
   *  Undecided tiles sort first within their own section, same original-file-order-within-group
   *  convention the flat list used before this redesign. */
  const { attentionTiles, readyTiles } = useMemo(() => {
    const items: TileItem[] = [];

    for (const r of categoryResolutions) {
      const expenseRows = grouping.rowsByTileKey.get(`${r.sourceName}::expense`) ?? [];
      const incomeRows = grouping.rowsByTileKey.get(`${r.sourceName}::income`) ?? [];
      const bothPresent = expenseRows.length > 0 && incomeRows.length > 0;
      const decided = isCategoryResolutionDecided(r, touchedCategorySources);
      if (expenseRows.length > 0) {
        items.push({
          kind: 'resolution',
          key: `${r.sourceName}::expense`,
          resolution: r,
          typeSuffix: bothPresent ? 'expense' : undefined,
          rows: expenseRows,
          decided
        });
      }
      if (incomeRows.length > 0) {
        items.push({
          kind: 'resolution',
          key: `${r.sourceName}::income`,
          resolution: r,
          typeSuffix: bothPresent ? 'income' : undefined,
          rows: incomeRows,
          decided
        });
      }
    }

    for (const [key, info] of grouping.syntheticTiles) {
      items.push({
        kind: 'synthetic',
        key,
        categoryId: info.categoryId,
        categoryName: info.categoryName,
        rows: grouping.rowsByTileKey.get(key) ?? []
      });
    }

    return {
      attentionTiles: items.filter((t): t is ResolutionTileItem => t.kind === 'resolution' && !t.decided),
      // Synthetic tiles are always ready (a row-level override is itself an explicit decision).
      readyTiles: items.filter((t) => t.kind === 'synthetic' || (t.kind === 'resolution' && t.decided))
    };
  }, [categoryResolutions, grouping, touchedCategorySources]);

  /** Auto-expand cascade for the three peer bucket cards below (2026-08-13, bucket-tiles redesign,
   *  decision #4) — whichever is non-empty first, in priority order Needs-input → Staged → Already-
   *  imported, mirrors `ReviewStep.tsx`'s own "auto-expand whatever most needs the user's attention"
   *  convention. None expanded if all three are empty (shouldn't normally happen, but guarded). Each
   *  bucket's expanded state stays on this computed default until the user manually toggles THAT bucket
   *  — toggling one never affects its siblings' own auto/manual state (same "auto until touched"
   *  convention as `ReviewStep.tsx`'s Accounts/Preview sections). */
  const defaultExpandedBucket: BucketKey | null =
    attentionTiles.length > 0
      ? 'attention'
      : readyTiles.length > 0
        ? 'ready'
        : grouping.duplicateRows.length > 0
          ? 'duplicate'
          : null;
  const [manuallyExpandedBuckets, setManuallyExpandedBuckets] = useState<Partial<Record<BucketKey, boolean>>>({});

  function isBucketExpanded(key: BucketKey): boolean {
    return manuallyExpandedBuckets[key] ?? key === defaultExpandedBucket;
  }
  function toggleBucket(key: BucketKey) {
    setManuallyExpandedBuckets((prev) => ({ ...prev, [key]: !isBucketExpanded(key) }));
  }

  return (
    <View className="gap-3">
      {/* (a) structurally unparsed rows */}
      <UnparsedRows rejectedRows={rejectedRows} mapping={mapping} header={header} onFixRejected={onFixRejected} />

      {/* (a2) redundant carry-forward markers — excluded, never silently dropped */}
      <CarryForwardExcluded rows={carryForwardExcludedRows} />

      {/* (b) linked transfer pairs — collapsed by default, like a category tile, so a file with many
       *  self-transfers doesn't push the category tiles far down the scroll. Never ALSO shown inside a
       *  category tile below (2026-08-13, review redesign issue #4) — this is their one and only home. */}
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
                  <TransferPairCard
                    pair={pair}
                    onUnpair={() => onUnpairTransfer(pair.outgoingIndex, pair.incomingIndex)}
                  />
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

      {/* (c) the three peer readiness buckets (2026-08-13, review redesign issue #6; promoted to real
       *  bordered bucket cards in the bucket-tiles redesign, same day) — each independently collapsible,
       *  auto-expanded per the cascade computed above. */}
      {attentionTiles.length > 0 && (
        <BucketCard
          dotColor={theme.warning}
          title="Needs your input"
          count={attentionTiles.length}
          expanded={isBucketExpanded('attention')}
          onToggle={() => toggleBucket('attention')}
        >
          {attentionTiles.map((t) => (
            <CategoryTile
              key={t.key}
              resolution={t.resolution}
              decided={t.decided}
              status="attention"
              rows={t.rows}
              categories={categories}
              transferAccountOptions={transferAccountOptions}
              txnCountByCategory={txnCountByCategory}
              groupOptions={groupOptions}
              tag={categoryTags.get(t.resolution.sourceName) ?? ''}
              rowOverrides={rowOverrides}
              typeSuffix={t.typeSuffix}
              rememberedSuggestion={rememberedSuggestions.get(t.resolution.sourceName)}
              onTagChange={(tag) => onUpdateCategoryTag(t.resolution.sourceName, tag)}
              onUpdate={(suggestion) => onUpdateCategory(t.resolution.sourceName, suggestion)}
              onMoveRowsToCategory={onMoveRowsToCategory}
              onTagRows={onTagRows}
              onAcknowledge={() => onAcknowledge(t.resolution.sourceName)}
            />
          ))}
        </BucketCard>
      )}

      {readyTiles.length > 0 && (
        <BucketCard
          dotColor={theme.success}
          title="Staged — ready to import"
          count={readyTiles.length}
          expanded={isBucketExpanded('ready')}
          onToggle={() => toggleBucket('ready')}
        >
          {readyTiles.map((t) =>
            t.kind === 'synthetic' ? (
              <MovedRowsTile
                key={t.key}
                categoryName={t.categoryName}
                rows={t.rows}
                rowOverrides={rowOverrides}
                onTagRows={onTagRows}
              />
            ) : (
              <CategoryTile
                key={t.key}
                resolution={t.resolution}
                decided={t.decided}
                status="ready"
                rows={t.rows}
                categories={categories}
                transferAccountOptions={transferAccountOptions}
                txnCountByCategory={txnCountByCategory}
                groupOptions={groupOptions}
                tag={categoryTags.get(t.resolution.sourceName) ?? ''}
                rowOverrides={rowOverrides}
                typeSuffix={t.typeSuffix}
                rememberedSuggestion={rememberedSuggestions.get(t.resolution.sourceName)}
                onTagChange={(tag) => onUpdateCategoryTag(t.resolution.sourceName, tag)}
                onUpdate={(suggestion) => onUpdateCategory(t.resolution.sourceName, suggestion)}
                onMoveRowsToCategory={onMoveRowsToCategory}
                onTagRows={onTagRows}
                onAcknowledge={() => onAcknowledge(t.resolution.sourceName)}
              />
            )
          )}
        </BucketCard>
      )}

      {grouping.duplicateRows.length > 0 && (
        <BucketCard
          dotColor={theme.neutral}
          title="Already imported"
          count={grouping.duplicateRows.length}
          expanded={isBucketExpanded('duplicate')}
          onToggle={() => toggleBucket('duplicate')}
        >
          <DuplicatesBucket rows={grouping.duplicateRows} rowOverrides={rowOverrides} />
        </BucketCard>
      )}
    </View>
  );
}
