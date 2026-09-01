import { memo } from 'react';
import { View, Pressable, Text } from 'react-native';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatCurrency } from '@/lib/formatters';
import { formatDate } from '@/lib/date';
import type { ParsedRow } from '@/core/import/importParsers';
import type { TransactionType } from '@/core/db/types';

function signFor(type: ParsedRow['type']): string {
  return type === 'income' ? '+' : type === 'expense' ? '−' : '';
}

/** The subset of a matched `Expense`'s fields this row actually renders — kept as a small plain object
 *  (not the full `Expense`) so the caller can pass primitives straight through instead of a `Map`
 *  lookup's live identity, and so this memoized row only re-renders when one of these specific fields
 *  actually changes. */
export interface DuplicatePairRowMatched {
  description: string;
  amount: number;
  date: number;
  type?: TransactionType;
  categoryName: string;
  accountName?: string;
}

interface DuplicatePairRowProps {
  row: ParsedRow;
  index: number;
  /** The real existing DB expense this row matched, when one exists — see `ResolvedPreviewRow
   *  .matchedExpenseId`'s own doc comment for the same-batch-only case (`undefined` here) that falls back
   *  to a plain "appears more than once in this file" caption instead. */
  matched?: DuplicatePairRowMatched;
  overrideCategoryName?: string;
  overrideTag?: string;
  onNotADuplicate: (index: number) => void;
}

/**
 * One paired CSV-row/matched-expense card — extracted out of `DuplicatesBucket.tsx` (2026-08-23, item 75)
 * so the exact same visual/behavior renders identically whether it's shown inline in that bucket's own
 * per-group list (capped) or inside `DuplicatesSeeAllModal.tsx`'s virtualized "see all" popup (uncapped),
 * instead of the same JSX being forked in two places. `memo`-wrapped since the popup renders this inside a
 * `FlashList` `renderItem`.
 */
export const DuplicatePairRow = memo(function DuplicatePairRow({
  row,
  index,
  matched,
  overrideCategoryName,
  overrideTag,
  onNotADuplicate
}: DuplicatePairRowProps) {
  const theme = useThemeColors();
  return (
    <View className="rounded-xl border border-theme overflow-hidden">
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
          {overrideCategoryName && (
            <Text className="text-[10px] mt-0.5" style={{ color: theme.primary }} numberOfLines={1}>
              moved to {overrideCategoryName}
            </Text>
          )}
          {overrideTag && (
            <Text className="text-[10px] mt-0.5" style={{ color: theme.info }}>
              #{overrideTag}
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
                {matched.categoryName}
                {matched.accountName ? ` · ${matched.accountName}` : ''}
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
});
