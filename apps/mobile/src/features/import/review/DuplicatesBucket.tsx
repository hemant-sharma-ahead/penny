import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import type { Account, Expense, ExpenseCategory } from '@/core/db/types';
import type { ParsedRow } from '@/core/import/importParsers';
import type { RowOverride } from '@/core/import/importPipeline';
import { formatCurrency } from '@/lib/formatters';
import { formatDate } from '@/lib/date';
import { useThemeColors } from '~/theme/useThemeColors';

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

/** Initial render cap, same reasoning `TileRowList.tsx`'s own `RENDER_CAP` documents — a real re-import
 *  can flag a few hundred rows as "already imported," and an unbounded `.map()` over that is a native
 *  crash risk even though parsing itself is instant (`docs/ARCHITECTURE.md`'s 2026-08-13 entry). Unlike
 *  that component's own hard cap-with-no-escape, this bucket adds a real "Show N more" — a genuine user
 *  report ("only shows first 60 and there is no way to see all of them"), so each tap renders one more
 *  BOUNDED batch rather than the whole remainder in one shot — still never an unbounded render, but the
 *  user can actually reach the end. */
const INITIAL_RENDER_CAP = 60;
const LOAD_MORE_BATCH = 60;

function signFor(type: ParsedRow['type']): string {
  return type === 'income' ? '+' : type === 'expense' ? '−' : '';
}

/**
 * "Already imported" bucket body (2026-08-16 redesign, real user report: "how does it recognize the
 * already imported one? It should show them side by side like we show in other places" — previously a
 * flat list with just a static "same date, amount & description as a logged expense" caption, with
 * nothing concrete backing it up). Ported from Bank Import's `MatchedBucket.tsx` paired-card visual
 * language (CSV row on the left, the actual matched `Expense` on the right, now also showing its category
 * and account) rather than inventing a new one — see `docs/mockups/proposals/expenses-batch-fixes-v1.html`
 * §2 for the approved mockup. A row with no `matchedExpenseByIndex` entry (a same-batch-only "repeated
 * line in this file" match, not a real DB match — see `ResolvedPreviewRow.matchedExpenseId`'s own doc
 * comment) falls back to the old static caption, since there's no second DB row to show.
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
  const [visibleCount, setVisibleCount] = useState(INITIAL_RENDER_CAP);

  if (rows.length === 0) return null;

  const visibleRows = rows.slice(0, visibleCount);
  const remaining = rows.length - visibleRows.length;

  return (
    <View className="gap-2">
      {visibleRows.map(({ row, index }) => {
        const matched = matchedExpenseByIndex.get(index);
        const override = rowOverrides.get(index);
        const acc = matched?.accountId ? accountMap.get(matched.accountId) : undefined;
        const cat = matched ? categoryMap.get(matched.categoryId) : undefined;
        return (
          <View key={index} className="rounded-xl border border-theme overflow-hidden">
            <View className="flex-row">
              <View className="flex-1 p-2.5 bg-surface-2">
                <Text className="text-[9px] uppercase tracking-wide text-tertiary">CSV row</Text>
                <Text className="text-xs font-semibold text-primary mt-0.5" numberOfLines={1}>
                  {row.description}
                </Text>
                <Text className="text-xs text-secondary mt-0.5">
                  {signFor(row.type)}
                  {formatCurrency(row.amount)} · {formatDate(row.date)}
                </Text>
                {override?.categoryName && (
                  <Text className="text-[10px] mt-0.5" style={{ color: theme.primary }} numberOfLines={1}>
                    moved to {override.categoryName}
                  </Text>
                )}
                {override?.tag && (
                  <Text className="text-[10px] mt-0.5" style={{ color: theme.info }}>
                    #{override.tag}
                  </Text>
                )}
              </View>
              <View className="flex-1 p-2.5 border-l border-dashed border-theme">
                <Text className="text-[9px] uppercase tracking-wide text-tertiary">Recorded</Text>
                {matched ? (
                  <>
                    <Text className="text-xs font-semibold text-primary mt-0.5" numberOfLines={1}>
                      {matched.description}
                    </Text>
                    <Text className="text-xs text-secondary mt-0.5">
                      {matched.type === 'income' ? '+' : '−'}
                      {formatCurrency(matched.amount)} · {formatDate(matched.date)}
                    </Text>
                    <Text className="text-[10px] text-tertiary mt-0.5" numberOfLines={1}>
                      {cat?.name ?? 'Uncategorized'}
                      {acc ? ` · ${acc.name}` : ''}
                    </Text>
                  </>
                ) : (
                  <Text className="text-xs text-secondary mt-0.5">
                    This exact transaction appears more than once in the file you&apos;re importing
                  </Text>
                )}
              </View>
            </View>
            <Pressable onPress={() => onNotADuplicate(index)} className="px-2.5 py-2 border-t border-theme" hitSlop={4}>
              <Text className="text-[10px] font-semibold" style={{ color: theme.info }}>
                Not a duplicate — import anyway
              </Text>
            </Pressable>
          </View>
        );
      })}
      {remaining > 0 && (
        <Pressable onPress={() => setVisibleCount((v) => v + LOAD_MORE_BATCH)} className="items-center py-2">
          <Text className="text-xs font-semibold" style={{ color: theme.primary }}>
            Show {Math.min(remaining, LOAD_MORE_BATCH)} more ({remaining} left)
          </Text>
        </Pressable>
      )}
    </View>
  );
}
