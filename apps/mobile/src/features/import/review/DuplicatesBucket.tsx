import { useMemo, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Account, Expense, ExpenseCategory } from '@/core/db/types';
import type { ParsedRow } from '@/core/import/importParsers';
import type { RowOverride } from '@/core/import/importPipeline';
import { DuplicatePairRow, type DuplicatePairRowMatched } from './DuplicatePairRow';
import { DuplicatesSeeAllModal } from './DuplicatesSeeAllModal';

interface DuplicatesBucketProps {
  /** Every row excluded from a normal category tile because it's a duplicate — one single flat,
   *  whole-import bucket (never per-category). See `importTransactionsGrouping.ts`'s doc comment for
   *  exclusion precedence vs. a transfer-paired row. */
  rows: { row: ParsedRow; index: number }[];
  rowOverrides: Map<number, RowOverride>;
  /** The real existing DB expense a row matched against, keyed by row index (2026-08-16) — see
   *  `TransactionsStage.tsx`'s `matchedExpenseByIndex` and `ResolvedPreviewRow.matchedExpenseId`'s own
   *  doc comment. Absent for a same-batch-only match (a repeated line within this file, no second DB row
   *  to point at) — that case still renders, just without a "Recorded" side to compare against, and with
   *  a caption clearly framed as "duplicate within this import" rather than "already in Penny" (2026-08-20
   *  fix — the two cases used to share identical misleading text; see this file's own fallback caption
   *  below). */
  matchedExpenseByIndex: Map<number, Expense>;
  accountMap: Map<string, Account>;
  categoryMap: Map<string, ExpenseCategory>;
  /** "Not a duplicate — import anyway" (2026-08-14, redesign §8/Issue #7) — moves the row back into its
   *  normal category-decision tile instead of leaving it permanently excluded. Light touch: a per-row
   *  action, not a full un-flag mechanism (see the redesign doc's §8 "light touch, not full bank-import
   *  parity" decision). */
  onNotADuplicate: (index: number) => void;
}

/** Initial per-GROUP render cap + "Show N more" batch size (2026-08-23, item 75 — moved from a single
 *  whole-bucket cap to one per category group, reusing the exact same 60/60 numbers). Same reasoning
 *  `TileRowList.tsx`'s own render cap documents — a real re-import can flag a few hundred rows as
 *  "already imported" for one category alone, and an unbounded `.map()` over that is a native crash risk
 *  even though parsing itself is instant (`docs/ARCHITECTURE.md`'s 2026-08-13 entry). Genuinely large
 *  groups are still fully reachable via each group's own "See all" popup
 *  (`DuplicatesSeeAllModal.tsx`, virtualized), never a hard dead end. */
const INITIAL_RENDER_CAP = 60;
const LOAD_MORE_BATCH = 60;

/**
 * "Already imported" bucket body (2026-08-16 redesign: paired CSV-row/matched-expense cards, ported from
 * Bank Import's `MatchedBucket.tsx` visual language; 2026-08-23, item 75: grouped by the same raw CSV
 * category name the Needs-Review/Ready/Skipped tiles already group by — `row.categoryName`, the same key
 * `CategoryTile.tsx`/`importTransactionsGrouping.ts` use — instead of one flat, undifferentiated list, so
 * a user with e.g. 74 duplicate ATM-withdrawal rows and 2 duplicate Zomato rows can jump straight to just
 * the group they care about, matching every other tile on this screen. Purely a reorganization — the
 * paired card and its "Not a duplicate" action are unchanged, and there's still no bulk action here (see
 * `docs/mockups/proposals/moneyview-import-review-v1.html`'s item 75 frame — "nothing new here, just
 * better usage of what we have").
 */
export function DuplicatesBucket({
  rows,
  rowOverrides,
  matchedExpenseByIndex,
  accountMap,
  categoryMap,
  onNotADuplicate
}: DuplicatesBucketProps) {
  const theme = useThemeColors();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [visibleCounts, setVisibleCounts] = useState<Map<string, number>>(new Map());
  const [seeAllGroup, setSeeAllGroup] = useState<string | null>(null);

  // Rows already arrive most-recent-first within the whole bucket (see
  // `importTransactionsGrouping.ts`'s `sortByDateDescending`) — preserved within each group here. Groups
  // themselves are ordered biggest-first, matching this screen's own "biggest bucket of attention first"
  // convention elsewhere.
  const groups = useMemo(() => {
    const map = new Map<string, { row: ParsedRow; index: number }[]>();
    for (const entry of rows) {
      const key = entry.row.categoryName.trim() || 'Other';
      const list = map.get(key);
      if (list) list.push(entry);
      else map.set(key, [entry]);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [rows]);

  if (rows.length === 0) return null;

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function resolveMatched(index: number): DuplicatePairRowMatched | undefined {
    const matchedExpense = matchedExpenseByIndex.get(index);
    if (!matchedExpense) return undefined;
    const acc = matchedExpense.accountId ? accountMap.get(matchedExpense.accountId) : undefined;
    const cat = categoryMap.get(matchedExpense.categoryId);
    return {
      description: matchedExpense.description,
      amount: matchedExpense.amount,
      date: matchedExpense.date,
      type: matchedExpense.type,
      categoryName: cat?.name ?? 'Uncategorized',
      accountName: acc?.name
    };
  }

  const seeAllRows = seeAllGroup ? (groups.find(([name]) => name === seeAllGroup)?.[1] ?? []) : [];

  return (
    <View className="gap-2">
      {groups.map(([categoryName, groupRows]) => {
        const expanded = expandedGroups.has(categoryName);
        const visibleCount = visibleCounts.get(categoryName) ?? INITIAL_RENDER_CAP;
        const visibleRows = groupRows.slice(0, visibleCount);
        const remaining = groupRows.length - visibleRows.length;
        const hasSeeAll = groupRows.length > INITIAL_RENDER_CAP;

        return (
          <View key={categoryName} className="rounded-xl overflow-hidden border border-theme">
            <Pressable
              onPress={() => toggleGroup(categoryName)}
              className="flex-row items-center gap-1.5 px-2.5 py-2"
              style={{ backgroundColor: tint(theme.neutral, 12) }}
            >
              <Text className="text-[10.5px] font-bold text-primary flex-1" numberOfLines={1}>
                &quot;{categoryName}&quot;
              </Text>
              <View className="rounded-full bg-surface-3 px-1.5 py-0.5">
                <Text className="text-[9px] font-bold text-secondary">
                  {groupRows.length} dupe{groupRows.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <Icon name={expanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={13} color={theme.textTertiary} />
            </Pressable>

            {expanded && (
              <View className="border-t border-theme px-2.5 py-2.5 gap-2" style={{ backgroundColor: theme.surface }}>
                {visibleRows.map(({ row, index }) => {
                  const override = rowOverrides.get(index);
                  return (
                    <DuplicatePairRow
                      key={index}
                      row={row}
                      index={index}
                      matched={resolveMatched(index)}
                      overrideCategoryName={override?.categoryName}
                      overrideTag={override?.tag}
                      onNotADuplicate={onNotADuplicate}
                    />
                  );
                })}

                {(remaining > 0 || hasSeeAll) && (
                  <View className="flex-row items-center justify-between border-t border-dashed border-theme pt-2">
                    {remaining > 0 ? (
                      <Pressable
                        onPress={() =>
                          setVisibleCounts((prev) => new Map(prev).set(categoryName, visibleCount + LOAD_MORE_BATCH))
                        }
                      >
                        <Text className="text-xs font-semibold" style={{ color: theme.primary }}>
                          Show {Math.min(remaining, LOAD_MORE_BATCH)} more ({remaining} left)
                        </Text>
                      </Pressable>
                    ) : (
                      <View />
                    )}
                    {hasSeeAll && (
                      <Pressable onPress={() => setSeeAllGroup(categoryName)}>
                        <Text className="text-xs font-semibold" style={{ color: theme.primary }}>
                          See all {groupRows.length} →
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        );
      })}

      {seeAllGroup && (
        <DuplicatesSeeAllModal
          categoryName={seeAllGroup}
          rows={seeAllRows}
          rowOverrides={rowOverrides}
          matchedExpenseByIndex={matchedExpenseByIndex}
          accountMap={accountMap}
          categoryMap={categoryMap}
          onNotADuplicate={onNotADuplicate}
          onClose={() => setSeeAllGroup(null)}
        />
      )}
    </View>
  );
}
