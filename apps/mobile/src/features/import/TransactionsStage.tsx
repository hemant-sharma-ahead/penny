import { useMemo, useState } from 'react';
import { View, Pressable, ScrollView, Text } from 'react-native';
import { Button, Banner } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Account, Expense, ExpenseCategory, Hashtag, Person } from '@/core/db/types';
import type { ParsedRow, RejectedRow } from '@/core/import/importParsers';
import type { ColumnMapping } from '@/core/import/importMatcher';
import type { CategoryAction } from '@/core/import/importCategoryResolution';
import type { ResolvedPreviewRow, RowOverride } from '@/core/import/importPipeline';
import type { AccountInput } from '~/hooks/useAccountForm';
import type { CashWithdrawalSuggestion, DisplayTransferPair, TransactionsRowGroup } from './useImport';
import type { TransactionsGroupingResult } from '@/core/import/importTransactionsGrouping';
import { CategoryTile } from './review/CategoryTile';
import { MovedRowsTile } from './review/MovedRowsTile';
import { SkippedGroupTile } from './review/SkippedGroupTile';
import { DuplicatesBucket } from './review/DuplicatesBucket';
import { TransferPairCard } from './review/TransferPairCard';
import { CashWithdrawalSuggestionCard } from './review/CashWithdrawalSuggestionCard';
import { UnparsedRows } from './review/UnparsedRows';
import { CarryForwardExcluded } from './review/CarryForwardExcluded';
import { ImportCategorizeModal } from './review/ImportCategorizeModal';
import { BucketCard } from '~/components/shared/BucketCard';
import { useBucketExpansion } from '~/hooks/useBucketExpansion';

interface TransactionsStageProps {
  rejectedRows: RejectedRow[];
  mapping: ColumnMapping | null;
  header: string[];
  onFixRejected: (rowIndex: number, fields: { date: string; amount: string; description: string }) => boolean;
  onDiscardRejected: (rowIndex: number) => void;
  carryForwardExcludedRows: ParsedRow[];
  transferPairs: DisplayTransferPair[];
  onUnpairTransfer: (outgoingIndex: number, incomingIndex: number) => void;
  /** "Turn these into transfers to your Cash account?" suggestions (2026-08-20, real-device testing
   *  pass) — see `useImport.ts`'s "Cash-withdrawal → transfer" section. Rendered alongside "Linked
   *  transfers" since both are pre-commit, opt-in "is this really a transfer?" nudges over the same
   *  Transactions-stage row-group data, just triggered by a different signal (a single-leg cash/ATM
   *  withdrawal category vs. a two-row same-file pairing). */
  cashWithdrawalSuggestions: CashWithdrawalSuggestion[];
  /** Keyed by `CashWithdrawalSuggestion.key` (2026-08-23, item 71 follow-up — one per source account
   *  within a category, not the shared `fullKey` alone). */
  cashWithdrawalTargets: Map<string, { accountId: string; accountName: string }>;
  onAcceptCashWithdrawalTransfer: (key: string, accountId: string, accountName: string) => void;
  onDismissCashWithdrawalSuggestion: (key: string) => void;
  onUndoCashWithdrawalTransfer: (key: string) => void;
  /** Creates a real `Account` immediately — backs the cash-withdrawal suggestion card's "+ Create a
   *  Cash account" sub-flow. See `useImport.ts`'s `createAccount` doc comment. */
  createAccount: (data: AccountInput, editing: Account | null) => Promise<Account>;
  rowGroups: TransactionsRowGroup[];
  grouping: TransactionsGroupingResult;
  /** Row-index-keyed resolution, including which existing DB expense (if any) a duplicate row matched
   *  (2026-08-16) — see `DuplicatesBucket`'s own doc comment for why this feeds the side-by-side view. */
  preview: ResolvedPreviewRow[];
  expenseById: Map<string, Expense>;
  categories: ExpenseCategory[];
  accounts: Account[];
  persons: Person[];
  /** Tag suggestions for `ImportCategorizeModal`'s tag field (2026-08-20, item 41 real-device testing
   *  pass) — its "Frequent"/live-suggestion row, ported from `BulkHashtagModal.tsx`'s identical pattern. */
  hashtags: Hashtag[];
  excludeAccountId: string | undefined;
  txnCountByCategory: Map<string, number>;
  categoryTagsByKey: Map<string, string>;
  rowOverrides: Map<number, RowOverride>;
  iouPersonNames: Map<string, string>;
  /** Per-row-index IOU person capture (code-review fix) — see `useImport.ts`'s `rowIouPersonNames` doc
   *  comment for why a partial-selection apply can't be represented by the group-keyed map above. */
  rowIouPersonNames: Map<number, string>;
  rememberedSuggestions: Map<string, { categoryId: string; categoryName: string }>;
  attentionCount: number;
  readyCount: number;
  duplicateCount: number;
  skippedCount: number;
  /** Row count for the "Staged" bucket badge (2026-08-14, bucket-badge/row-count consistency fix) —
   *  see `useImport.ts`'s `stagedRowCount` doc comment. */
  stagedRowCount: number;
  actualTransactionCount: number;
  totalRowsRead: number;
  onUpdate: (fullKey: string, suggestion: CategoryAction) => void;
  onTagChange: (fullKey: string, tag: string) => void;
  onAcknowledge: (fullKey: string) => void;
  onIouPersonNameChange: (fullKey: string, name: string) => void;
  onSetRowIouPersonNames: (rowIndices: number[], name: string) => void;
  onMoveRowsToCategory: (rowIndices: number[], categoryId: string, categoryName: string) => void;
  onTagRows: (rowIndices: number[], tag: string) => void;
  onNotADuplicate: (index: number) => void;
  /** Creates a real `ExpenseCategory` immediately (2026-08-20, item 41 flow redesign) — forwarded to
   *  `CategoryTile` → `ImportCategorizeModal`'s "Create" kind. See `useImport.ts`'s `createCategory` doc
   *  comment. */
  onCreateCategory: (cat: ExpenseCategory) => Promise<void>;
  onImport: () => void;
}

type BucketKey = 'attention' | 'ready' | 'skipped' | 'duplicate';

/** Initial tile-list render cap + "Show N more" batch (2026-08-21, real-device testing pass — a Cashew
 *  CSV import was reported missing the pattern) — same reasoning as `TileRowList.tsx`'s own row-level
 *  cap (docs/ARCHITECTURE.md's "unbounded `.map()` over bulk-imported data" rule), just applied one
 *  level up: `needsInputGroups`/`stagedGroups`/`skippedGroups` below used to render as a plain,
 *  fully-unbounded `.map()` of `CategoryTile`/`SkippedGroupTile` components. Item 40 only capped the
 *  ROWS inside one tile (`TileRowList.tsx`) — the number of TILES itself was still unbounded, and a
 *  Cashew export (which groups by free-form title/category far more granularly than a bank statement
 *  typically does) can realistically produce far more distinct groups than that. Smaller than
 *  `TileRowList`'s 60 — each tile is a much heavier component (its own accordion, buttons, and modal),
 *  not a single text row. */
const TILE_INITIAL_CAP = 25;
const TILE_LOAD_MORE_BATCH = 25;

/** "Show N more" footer for a capped tile list — same copy/style as `TileRowList.tsx`'s row-level
 *  version, just reusable across the three bucket lists below instead of duplicated three times. */
function ShowMoreTiles({ remaining, batch, onPress }: { remaining: number; batch: number; onPress: () => void }) {
  const theme = useThemeColors();
  if (remaining <= 0) return null;
  return (
    <Pressable onPress={onPress} className="py-2">
      <Text className="text-xs font-semibold text-center" style={{ color: theme.primary }}>
        Show {Math.min(remaining, batch)} more ({remaining} left)
      </Text>
    </Pressable>
  );
}

/**
 * New Transactions wizard stage (2026-08-14, CSV-import redesign Chunk B) — adapts the former
 * `PreviewSection.tsx`'s bucket model (Needs input / Staged / Skipped(new) / Already imported) to the new
 * Categories-stage-resolved `TransactionsRowGroup` model. Reached only once Accounts + Categories are
 * already decided, so a tile here is just: assign/override a row-group's category via the standing
 * `ImportCategorizeModal` kind-picker override (pre-populated with the Categories-stage decision), mark
 * specific rows transfer/skip via bulk-select, or (for an IOU-mandatory category) supply the person.
 */
export function TransactionsStage({
  rejectedRows,
  mapping,
  header,
  onFixRejected,
  onDiscardRejected,
  carryForwardExcludedRows,
  transferPairs,
  onUnpairTransfer,
  cashWithdrawalSuggestions,
  cashWithdrawalTargets,
  onAcceptCashWithdrawalTransfer,
  onDismissCashWithdrawalSuggestion,
  onUndoCashWithdrawalTransfer,
  createAccount,
  rowGroups,
  grouping,
  preview,
  expenseById,
  categories,
  accounts,
  persons,
  hashtags,
  excludeAccountId,
  txnCountByCategory,
  categoryTagsByKey,
  rowOverrides,
  iouPersonNames,
  rememberedSuggestions,
  attentionCount,
  readyCount,
  duplicateCount,
  skippedCount,
  stagedRowCount,
  actualTransactionCount,
  totalRowsRead,
  onUpdate,
  onTagChange,
  onAcknowledge,
  onIouPersonNameChange,
  onSetRowIouPersonNames,
  onMoveRowsToCategory,
  onTagRows,
  onNotADuplicate,
  onCreateCategory,
  onImport
}: TransactionsStageProps) {
  const theme = useThemeColors();
  const [transfersExpanded, setTransfersExpanded] = useState(false);
  const [recategorizeKey, setRecategorizeKey] = useState<string | null>(null);
  const [needsInputVisible, setNeedsInputVisible] = useState(TILE_INITIAL_CAP);
  const [stagedVisible, setStagedVisible] = useState(TILE_INITIAL_CAP);
  const [skippedVisible, setSkippedVisible] = useState(TILE_INITIAL_CAP);
  const transferAccountOptions = useMemo(
    () => accounts.filter((a) => a.id !== excludeAccountId),
    [accounts, excludeAccountId]
  );
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  // Which real existing expense (if any) each "Already imported" row matched (2026-08-16) — resolves
  // `preview[index].matchedExpenseId` against `expenseById` only for rows actually in this bucket, not
  // the whole preview array.
  const matchedExpenseByIndex = useMemo(() => {
    const map = new Map<number, Expense>();
    for (const { index } of grouping.duplicateRows) {
      const id = preview[index]?.matchedExpenseId;
      const exp = id ? expenseById.get(id) : undefined;
      if (exp) map.set(index, exp);
    }
    return map;
  }, [grouping.duplicateRows, preview, expenseById]);

  const defaultExpandedBucket: BucketKey | null =
    attentionCount > 0
      ? 'attention'
      : readyCount > 0
        ? 'ready'
        : duplicateCount > 0
          ? 'duplicate'
          : skippedCount > 0
            ? 'skipped'
            : null;
  const { isExpanded, toggle } = useBucketExpansion<BucketKey>(defaultExpandedBucket);

  const needsInputGroups = rowGroups.filter((g) => g.effectiveSuggestion.kind !== 'skip' && !g.transactionsReady);
  const stagedGroups = rowGroups.filter((g) => g.effectiveSuggestion.kind !== 'skip' && g.transactionsReady);
  const skippedGroups = rowGroups.filter((g) => g.effectiveSuggestion.kind === 'skip');

  // "Nothing ready to import at all" — the ONLY thing that disables Confirm (2026-08-14, manual-testing
  // gap: the button used to also disable whenever `attentionCount > 0`, the old all-or-nothing gate
  // §3.2/Issue #4 explicitly rejected — a "needs your input" row is meant to be left OUT of this run,
  // never a reason to block the rest of it). Staged, Skipped, and any CONFIRMED (not-already-imported)
  // linked transfer all count as "something to commit" — only Needs-input/duplicate rows existing, with
  // nothing else, means there's genuinely nothing for Confirm to do.
  const pendingTransferPairCount = transferPairs.filter((p) => !p.alreadyImported).length;
  const nothingReadyToCommit =
    stagedGroups.length === 0 &&
    grouping.syntheticTiles.size === 0 &&
    skippedGroups.length === 0 &&
    pendingTransferPairCount === 0;

  const recategorizeGroup = recategorizeKey ? rowGroups.find((g) => g.fullKey === recategorizeKey) : undefined;
  const recategorizeRows = recategorizeGroup ? (grouping.rowsByFullKey.get(recategorizeGroup.fullKey) ?? []) : [];

  function renderTile(g: TransactionsRowGroup, status: 'ready' | 'attention') {
    const rows = grouping.rowsByFullKey.get(g.fullKey) ?? [];
    if (rows.length === 0) return null;
    return (
      <CategoryTile
        key={g.fullKey}
        resolution={{ sourceName: g.label, count: g.count, suggestion: g.effectiveSuggestion }}
        decided={g.decided}
        status={status}
        rows={rows}
        categories={categories}
        transferAccountOptions={transferAccountOptions}
        txnCountByCategory={txnCountByCategory}
        tag={categoryTagsByKey.get(g.fullKey) ?? ''}
        rowOverrides={rowOverrides}
        rememberedSuggestion={rememberedSuggestions.get(g.parentSourceName)}
        iouPersons={persons}
        hashtags={hashtags}
        initialIouPersonName={iouPersonNames.get(g.fullKey) ?? ''}
        onIouPersonNameChange={(name) => onIouPersonNameChange(g.fullKey, name)}
        onSetRowIouPersonNames={onSetRowIouPersonNames}
        onTagChange={(tag) => onTagChange(g.fullKey, tag)}
        onUpdate={(s) => onUpdate(g.fullKey, s)}
        onMoveRowsToCategory={onMoveRowsToCategory}
        onTagRows={onTagRows}
        onAcknowledge={() => onAcknowledge(g.fullKey)}
        isInvestmentMovement={g.isInvestmentMovement}
        isTransferSuspect={g.isTransferSuspect}
        isIouSuspect={g.isIouSuspect}
        onCreateCategory={onCreateCategory}
      />
    );
  }

  return (
    <View className="flex-1">
      <View className="px-4 pt-3 pb-2 border-b border-theme bg-surface gap-1 flex-row items-center justify-between">
        <Text className="text-[11.5px] font-bold text-primary">Transactions</Text>
        <Text className="text-[10.5px] text-tertiary">{totalRowsRead} rows</Text>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingTop: 12, paddingBottom: 16, gap: 12 }}>
        {/* Explains why this stage still exists now that Categories already decides most of it
         *  (2026-08-14, manual-testing refinement #3) — Categories resolves the CATEGORY per source
         *  name/counterparty; this stage is where the actual per-transaction rows in each group get a
         *  final look before anything is written. */}
        <Banner variant="info">
          Categories are already set from the last step. Use this screen to double-check the actual transactions in each
          group, adjust a category if something looks off, or import only part of a group now — the rest can wait for a
          later re-upload.
        </Banner>

        <UnparsedRows
          rejectedRows={rejectedRows}
          mapping={mapping}
          header={header}
          onFixRejected={onFixRejected}
          onDiscardRejected={onDiscardRejected}
        />
        <CarryForwardExcluded rows={carryForwardExcludedRows} />

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
              <Icon
                name={transfersExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}
                size={14}
                color={theme.textTertiary}
              />
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

        {cashWithdrawalSuggestions.length > 0 && (
          <View className="gap-2">
            {cashWithdrawalSuggestions.map((s) => (
              <CashWithdrawalSuggestionCard
                key={s.key}
                suggestion={s}
                accounts={accounts}
                target={cashWithdrawalTargets.get(s.key)}
                onAccept={onAcceptCashWithdrawalTransfer}
                onDismiss={onDismissCashWithdrawalSuggestion}
                onUndo={onUndoCashWithdrawalTransfer}
                createAccount={createAccount}
              />
            ))}
          </View>
        )}

        {needsInputGroups.length > 0 && (
          <BucketCard
            dotColor={theme.warning}
            title="Needs your input"
            count={attentionCount}
            expanded={isExpanded('attention')}
            onToggle={() => toggle('attention')}
          >
            {needsInputGroups.slice(0, needsInputVisible).map((g) => renderTile(g, 'attention'))}
            <ShowMoreTiles
              remaining={needsInputGroups.length - needsInputVisible}
              batch={TILE_LOAD_MORE_BATCH}
              onPress={() => setNeedsInputVisible((v) => v + TILE_LOAD_MORE_BATCH)}
            />
          </BucketCard>
        )}

        {(stagedGroups.length > 0 || grouping.syntheticTiles.size > 0) && (
          <BucketCard
            dotColor={theme.success}
            title="Staged — ready to import"
            count={stagedRowCount}
            expanded={isExpanded('ready')}
            onToggle={() => toggle('ready')}
          >
            {stagedGroups.slice(0, stagedVisible).map((g) => renderTile(g, 'ready'))}
            <ShowMoreTiles
              remaining={stagedGroups.length - stagedVisible}
              batch={TILE_LOAD_MORE_BATCH}
              onPress={() => setStagedVisible((v) => v + TILE_LOAD_MORE_BATCH)}
            />
            {/* Synthetic "moved rows landed here" tiles are created only by an explicit user action
             *  (manually recategorizing rows into a category with no group of its own yet) — realistically
             *  always a handful, never bulk-imported data, so left uncapped. */}
            {Array.from(grouping.syntheticTiles.entries()).map(([key, info]) => (
              <MovedRowsTile
                key={key}
                categoryName={info.categoryName}
                rows={grouping.rowsByFullKey.get(key) ?? []}
                rowOverrides={rowOverrides}
                onTagRows={onTagRows}
              />
            ))}
          </BucketCard>
        )}

        {skippedGroups.length > 0 && (
          <BucketCard
            dotColor={theme.textTertiary}
            title="Skipped"
            count={skippedCount}
            expanded={isExpanded('skipped')}
            onToggle={() => toggle('skipped')}
          >
            {skippedGroups.slice(0, skippedVisible).map((g) => {
              const rows = grouping.rowsByFullKey.get(g.fullKey) ?? [];
              if (rows.length === 0) return null;
              return (
                <SkippedGroupTile
                  key={g.fullKey}
                  label={g.label}
                  rows={rows}
                  rowOverrides={rowOverrides}
                  onRecategorize={() => setRecategorizeKey(g.fullKey)}
                />
              );
            })}
            <ShowMoreTiles
              remaining={skippedGroups.length - skippedVisible}
              batch={TILE_LOAD_MORE_BATCH}
              onPress={() => setSkippedVisible((v) => v + TILE_LOAD_MORE_BATCH)}
            />
          </BucketCard>
        )}

        {grouping.duplicateRows.length > 0 && (
          <BucketCard
            dotColor={theme.neutral}
            title="Already imported"
            count={grouping.duplicateRows.length}
            expanded={isExpanded('duplicate')}
            onToggle={() => toggle('duplicate')}
          >
            <DuplicatesBucket
              rows={grouping.duplicateRows}
              rowOverrides={rowOverrides}
              matchedExpenseByIndex={matchedExpenseByIndex}
              accountMap={accountMap}
              categoryMap={categoryMap}
              onNotADuplicate={onNotADuplicate}
            />
          </BucketCard>
        )}

        {/* Non-blocking (2026-08-14, manual-testing gap — the old commit-gate bug) — informational only.
         *  Per §3.2/Issue #4, a "needs your input" row is left OUT of this run and picked up on a later
         *  re-upload once its category is resolved; it is never a reason to block the rest of the batch
         *  from importing now. */}
        {attentionCount > 0 && (
          <Text className="text-center text-[10.5px]" style={{ color: theme.warning, marginTop: -8 }}>
            {attentionCount} item{attentionCount !== 1 ? 's' : ''} still need{attentionCount === 1 ? 's' : ''} your
            input — {attentionCount === 1 ? 'it' : "they'll"} be left for a later re-upload
          </Text>
        )}

        {/* Tapping this only NAVIGATES to the Import Progress screen's Pre-start sub-state (2026-08-14,
         *  redesign §14 item 8) — nothing is written yet, no spinner needed here; the actual write only
         *  starts once that screen's own "Start Import" button is tapped. */}
        <Button variant="primary" disabled={nothingReadyToCommit} onPress={onImport}>
          {nothingReadyToCommit
            ? 'Nothing ready to import yet'
            : attentionCount > 0
              ? `Import ${actualTransactionCount} now — ${attentionCount} left for later`
              : `Import ${actualTransactionCount} transaction${actualTransactionCount !== 1 ? 's' : ''}`}
        </Button>
      </ScrollView>

      {recategorizeGroup && (
        <ImportCategorizeModal
          sourceName={recategorizeGroup.label}
          suggestion={recategorizeGroup.effectiveSuggestion}
          decided={recategorizeGroup.decided}
          totalCount={recategorizeRows.length}
          checkedCount={recategorizeRows.length}
          isPartialSelection={false}
          initialTag={categoryTagsByKey.get(recategorizeGroup.fullKey) ?? ''}
          categories={categories}
          transferAccountOptions={transferAccountOptions}
          txnCountByCategory={txnCountByCategory}
          pickerType={recategorizeGroup.type === 'income' ? 'income' : 'expense'}
          rememberedSuggestion={rememberedSuggestions.get(recategorizeGroup.parentSourceName)}
          iouPersons={persons}
          hashtags={hashtags}
          initialIouPersonName={iouPersonNames.get(recategorizeGroup.fullKey) ?? ''}
          onCreateCategory={onCreateCategory}
          onApplyFull={(action, newTag, iouPersonName) => {
            onUpdate(recategorizeGroup.fullKey, action);
            onTagChange(recategorizeGroup.fullKey, newTag);
            if (iouPersonName !== undefined) onIouPersonNameChange(recategorizeGroup.fullKey, iouPersonName);
            setRecategorizeKey(null);
          }}
          onApplyPartial={() => setRecategorizeKey(null)}
          onAcknowledge={() => {
            onAcknowledge(recategorizeGroup.fullKey);
            setRecategorizeKey(null);
          }}
          onClose={() => setRecategorizeKey(null)}
        />
      )}
    </View>
  );
}
