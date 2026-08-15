import { useMemo } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { Button } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Account, ExpenseCategory } from '@/core/db/types';
import { allIntentGroups, type CategoryAction } from '@/core/import/importCategoryResolution';
import type { TransactionsRowGroup } from './useImport';
import { CategoryResolutionRow } from './review/CategoryResolutionRow';
import { BucketCard } from '~/components/shared/BucketCard';
import { useBucketExpansion } from '~/hooks/useBucketExpansion';

interface CategoriesStageProps {
  rowGroups: TransactionsRowGroup[];
  categories: ExpenseCategory[];
  accounts: Account[];
  excludeAccountId: string | undefined;
  txnCountByCategory: Map<string, number>;
  categoryTagsByKey: Map<string, string>;
  rememberedSuggestions: Map<string, { categoryId: string; categoryName: string }>;
  decidedCount: number;
  allDecided: boolean;
  onUpdate: (fullKey: string, suggestion: CategoryAction) => void;
  onTagChange: (fullKey: string, tag: string) => void;
  onAcknowledge: (fullKey: string) => void;
  onMoveToResidual: (fullKey: string) => void;
  onNext: () => void;
}

type CategoryBucketKey = 'needsReview' | 'ready' | 'skipped';

function bucketForCategory(g: TransactionsRowGroup): CategoryBucketKey {
  if (g.effectiveSuggestion.kind === 'skip') return 'skipped';
  // Covers BOTH an unconfirmed 'create' guess and an unresolved counterparty sub-split group (a
  // still-default 'transfer'/'create' suggestion with nothing decided yet) — `g.decided` already
  // tracks exactly this (the same flag `categoriesDecidedCount`/`allDecided` were already built from).
  return g.decided ? 'ready' : 'needsReview';
}

/** Groups one bucket's own rows into plain (non-split) rows + each split parent's own children — the
 *  same "parent label + indented children" shape the un-bucketed screen always had, just recomputed per
 *  bucket so a parent whose children scatter across buckets (e.g. one child ready, another still needs
 *  review) gets its own mini-group-header independently in each bucket it has children in. */
function groupByParent(rowGroups: TransactionsRowGroup[]) {
  const plain: TransactionsRowGroup[] = [];
  const parents = new Map<string, TransactionsRowGroup[]>();
  for (const g of rowGroups) {
    if (!g.isSplitChild) {
      plain.push(g);
      continue;
    }
    const parentKey = `${g.parentSourceName}::${g.type}`;
    const list = parents.get(parentKey) ?? [];
    list.push(g);
    parents.set(parentKey, list);
  }
  return { plainRows: plain, splitParents: Array.from(parents.entries()) };
}

/**
 * New Categories wizard stage (2026-08-14, CSV-import redesign Chunk B —
 * docs/plans/csv-expense-import-redesign.md §7/§9.4/§9.d, mockup's "Categories stage" section). One row
 * per Categories-stage-resolvable unit (`useImport.ts`'s `TransactionsRowGroup`) — resolved here, BEFORE
 * any row-level triage (that's the Transactions stage's job next). A transfer/IOU-suspect category's
 * counterparty sub-split children render as indented rows under a plain (non-interactive) group-label
 * header; everything else renders as a standalone row.
 *
 * Rows are grouped into Needs Review / Ready / Skipped bucket cards (2026-08-14, manual-testing gap
 * #2) — the same `BucketCard`/`useBucketExpansion` pattern Transactions stage already built.
 *
 * "Continue" is NEVER gated on full resolution (2026-08-14, manual-testing gap #3 — a deliberate design
 * correction, not a bug fix: the final commit was always meant to be partial-tolerant, only "ready" rows
 * get written and "needs input" rows wait for a later re-upload pass (Issue #4's whole point). Nothing
 * required the CATEGORIES STAGE itself to hard-gate advancing on zero unresolved rows — that was a
 * stricter block than intended. A category left unresolved here just flows through as a normal "needs
 * attention" item once Transactions stage is reached, exactly the state that stage already has to
 * handle for an unconfirmed 'create' guess. Only the final commit action still cares about full
 * resolution of whatever's staged for THAT commit.
 */
export function CategoriesStage({
  rowGroups,
  categories,
  accounts,
  excludeAccountId,
  txnCountByCategory,
  categoryTagsByKey,
  rememberedSuggestions,
  decidedCount,
  allDecided,
  onUpdate,
  onTagChange,
  onAcknowledge,
  onMoveToResidual,
  onNext
}: CategoriesStageProps) {
  const theme = useThemeColors();
  const groupOptions = useMemo(() => allIntentGroups().map((g) => ({ value: g.key, label: g.label })), []);
  const transferAccountOptions = useMemo(
    () => accounts.filter((a) => a.id !== excludeAccountId),
    [accounts, excludeAccountId]
  );

  const buckets = useMemo(() => {
    const needsReview: TransactionsRowGroup[] = [];
    const ready: TransactionsRowGroup[] = [];
    const skipped: TransactionsRowGroup[] = [];
    for (const g of rowGroups) {
      const bucket = bucketForCategory(g);
      (bucket === 'needsReview' ? needsReview : bucket === 'ready' ? ready : skipped).push(g);
    }
    return {
      needsReview: groupByParent(needsReview),
      ready: groupByParent(ready),
      skipped: groupByParent(skipped),
      needsReviewCount: needsReview.length,
      readyCount: ready.length,
      skippedCount: skipped.length
    };
  }, [rowGroups]);

  const defaultExpandedBucket: CategoryBucketKey | null =
    buckets.needsReviewCount > 0
      ? 'needsReview'
      : buckets.readyCount > 0
        ? 'ready'
        : buckets.skippedCount > 0
          ? 'skipped'
          : null;
  const { isExpanded, toggle } = useBucketExpansion<CategoryBucketKey>(defaultExpandedBucket);

  function renderRows(grouped: ReturnType<typeof groupByParent>) {
    return (
      <>
        {grouped.plainRows.map((g) => (
          <CategoryResolutionRow
            key={g.fullKey}
            group={g}
            categories={categories}
            transferAccountOptions={transferAccountOptions}
            txnCountByCategory={txnCountByCategory}
            groupOptions={groupOptions}
            tag={categoryTagsByKey.get(g.fullKey) ?? ''}
            rememberedSuggestion={rememberedSuggestions.get(g.parentSourceName)}
            onUpdate={(s) => onUpdate(g.fullKey, s)}
            onTagChange={(t) => onTagChange(g.fullKey, t)}
            onAcknowledge={() => onAcknowledge(g.fullKey)}
          />
        ))}

        {grouped.splitParents.map(([parentKey, children]) => {
          const first = children[0];
          if (!first) return null;
          const totalCount = children.reduce((sum, c) => sum + c.count, 0);
          return (
            <View key={parentKey} className="gap-2 mt-2">
              <View className="flex-row items-center gap-1.5 px-0.5">
                <Text className="text-[11.5px] font-extrabold text-primary">&quot;{first.parentSourceName}&quot;</Text>
                <Text className="text-[9px] text-tertiary">
                  {totalCount} rows · splits below {first.type !== 'expense' ? `(${first.type})` : ''}
                </Text>
              </View>
              <View className="gap-2 pl-2.5" style={{ borderLeftWidth: 2, borderLeftColor: theme.border }}>
                {children.map((g) => (
                  <CategoryResolutionRow
                    key={g.fullKey}
                    group={g}
                    categories={categories}
                    transferAccountOptions={transferAccountOptions}
                    txnCountByCategory={txnCountByCategory}
                    groupOptions={groupOptions}
                    tag={categoryTagsByKey.get(g.fullKey) ?? ''}
                    rememberedSuggestion={rememberedSuggestions.get(g.parentSourceName)}
                    onUpdate={(s) => onUpdate(g.fullKey, s)}
                    onTagChange={(t) => onTagChange(g.fullKey, t)}
                    onAcknowledge={() => onAcknowledge(g.fullKey)}
                    onMoveToResidual={g.confidence === 'low' ? () => onMoveToResidual(g.fullKey) : undefined}
                  />
                ))}
              </View>
            </View>
          );
        })}
      </>
    );
  }

  return (
    <View className="flex-1">
      <View className="px-4 pt-3 pb-2 border-b border-theme bg-surface gap-1">
        <Text className="text-[11.5px] font-bold text-primary">Categories</Text>
        <Text className="text-[10.5px] text-tertiary">
          {decidedCount} of {rowGroups.length} decided
        </Text>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingTop: 12, paddingBottom: 16, gap: 8 }}>
        {buckets.needsReviewCount > 0 && (
          <BucketCard
            dotColor={theme.warning}
            title="Needs Review"
            count={buckets.needsReviewCount}
            expanded={isExpanded('needsReview')}
            onToggle={() => toggle('needsReview')}
          >
            {renderRows(buckets.needsReview)}
          </BucketCard>
        )}

        {buckets.readyCount > 0 && (
          <BucketCard
            dotColor={theme.success}
            title="Ready"
            count={buckets.readyCount}
            expanded={isExpanded('ready')}
            onToggle={() => toggle('ready')}
          >
            {renderRows(buckets.ready)}
          </BucketCard>
        )}

        {buckets.skippedCount > 0 && (
          <BucketCard
            dotColor={theme.textTertiary}
            title="Skipped"
            count={buckets.skippedCount}
            expanded={isExpanded('skipped')}
            onToggle={() => toggle('skipped')}
          >
            {renderRows(buckets.skipped)}
          </BucketCard>
        )}

        {/* Never blocks Continue (manual-testing gap #3) — purely informational; an unresolved category
         *  flows through to Transactions stage as a normal "needs attention" item instead. */}
        {!allDecided && (
          <Text className="text-center text-[10.5px] text-tertiary" style={{ marginTop: -2 }}>
            {buckets.needsReviewCount} categor{buckets.needsReviewCount !== 1 ? 'ies' : 'y'} still need review — you can
            continue and resolve {buckets.needsReviewCount !== 1 ? 'them' : 'it'} in Transactions.
          </Text>
        )}

        <Button variant="primary" onPress={onNext}>
          Continue
        </Button>
      </ScrollView>
    </View>
  );
}
