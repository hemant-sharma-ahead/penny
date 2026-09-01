import { useCallback } from 'react';
import { View, Pressable, Text, useWindowDimensions } from 'react-native';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { Modal } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Account, Expense, ExpenseCategory } from '@/core/db/types';
import type { ParsedRow } from '@/core/import/importParsers';
import type { RowOverride } from '@/core/import/importPipeline';
import { DuplicatePairRow, type DuplicatePairRowMatched } from './DuplicatePairRow';

interface DuplicatesSeeAllModalProps {
  categoryName: string;
  rows: { row: ParsedRow; index: number }[];
  rowOverrides: Map<number, RowOverride>;
  matchedExpenseByIndex: Map<number, Expense>;
  accountMap: Map<string, Account>;
  categoryMap: Map<string, ExpenseCategory>;
  onNotADuplicate: (index: number) => void;
  onClose: () => void;
}

/**
 * "See all" popup for one duplicates group (2026-08-23, item 75) — shows the SAME side-by-side CSV-row/
 * matched-expense pairing `DuplicatesBucket.tsx` already renders inline (via the shared
 * `DuplicatePairRow`), just scoped to one category group and reachable past its per-group 60-row inline
 * cap. Reuses `TransactionBrowserModal.tsx`'s shell/`Modal` pattern (centered, near-full-height, a
 * virtualized `FlashList` for a genuinely large group) — stripped of everything duplicates don't need: no
 * checkboxes/selection, no month-scrub bar, no "Categorize" footer — this bucket has no bulk action at
 * all, just the existing per-row "Not a duplicate" link.
 */
export function DuplicatesSeeAllModal({
  categoryName,
  rows,
  rowOverrides,
  matchedExpenseByIndex,
  accountMap,
  categoryMap,
  onNotADuplicate,
  onClose
}: DuplicatesSeeAllModalProps) {
  const theme = useThemeColors();
  const { height: screenHeight } = useWindowDimensions();
  // Same fixed-body-height math as `TransactionBrowserModal.tsx` — see that file's own doc comment for
  // where the 56/72/40 constants come from (`Modal.tsx`'s backdrop insets + its body padding).
  const modalBodyHeight = screenHeight - 56 - 72 - 40;

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<{ row: ParsedRow; index: number }>) => {
      const matchedExpense = matchedExpenseByIndex.get(item.index);
      const override = rowOverrides.get(item.index);
      const acc = matchedExpense?.accountId ? accountMap.get(matchedExpense.accountId) : undefined;
      const cat = matchedExpense ? categoryMap.get(matchedExpense.categoryId) : undefined;
      const matched: DuplicatePairRowMatched | undefined = matchedExpense
        ? {
            description: matchedExpense.description,
            amount: matchedExpense.amount,
            date: matchedExpense.date,
            type: matchedExpense.type,
            categoryName: cat?.name ?? 'Uncategorized',
            accountName: acc?.name
          }
        : undefined;
      return (
        <View style={{ paddingBottom: 8 }}>
          <DuplicatePairRow
            row={item.row}
            index={item.index}
            matched={matched}
            overrideCategoryName={override?.categoryName}
            overrideTag={override?.tag}
            onNotADuplicate={onNotADuplicate}
          />
        </View>
      );
    },
    [matchedExpenseByIndex, rowOverrides, accountMap, categoryMap, onNotADuplicate]
  );

  return (
    <Modal onClose={onClose}>
      <View style={{ height: modalBodyHeight }}>
        <View className="flex-row items-start gap-2 pb-2">
          <View className="flex-1 min-w-0">
            <Text className="text-sm font-extrabold text-primary" numberOfLines={1}>
              &quot;{categoryName}&quot; — Already imported
            </Text>
            <Text className="text-[10px] text-tertiary" style={{ marginTop: 1 }}>
              {rows.length} duplicate row{rows.length !== 1 ? 's' : ''} · same side-by-side comparison, just all of them
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            className="w-7 h-7 items-center justify-center rounded-lg"
            accessibilityLabel="Close"
          >
            <Icon name="ti-x" size={18} color={theme.textTertiary} />
          </Pressable>
        </View>

        <View className="flex-1">
          <FlashList
            data={rows}
            keyExtractor={(item) => String(item.index)}
            renderItem={renderItem}
            drawDistance={500}
          />
        </View>
      </View>
    </Modal>
  );
}
