import { useCallback } from 'react';
import { View, Pressable, Text, useWindowDimensions } from 'react-native';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { Modal } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatCurrency } from '@/lib/formatters';

function fmtShortDate(epoch: number): string {
  return new Date(epoch).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface CashWithdrawalRow {
  date: number;
  amount: number;
  description: string;
}

interface CashWithdrawalSeeAllModalProps {
  fromLabel: string;
  toLabel: string;
  rows: CashWithdrawalRow[];
  totalAmount: number;
  onClose: () => void;
}

/**
 * "See all" popup for an accepted cash-withdrawal → transfer group whose row count exceeds
 * `TileRowList.tsx`'s own >4-row inline threshold (2026-08-23, item 71) — same centered `Modal.tsx`
 * shell/pattern as `DuplicatesSeeAllModal.tsx` (item 75), but a plain date+amount list, NOT a side-by-side
 * pairing — these are this transfer's own candidate rows, not duplicate pairs.
 */
export function CashWithdrawalSeeAllModal({
  fromLabel,
  toLabel,
  rows,
  totalAmount,
  onClose
}: CashWithdrawalSeeAllModalProps) {
  const theme = useThemeColors();
  const { height: screenHeight } = useWindowDimensions();
  // Same fixed-body-height math as `TransactionBrowserModal.tsx`/`DuplicatesSeeAllModal.tsx`.
  const modalBodyHeight = screenHeight - 56 - 72 - 40;

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<CashWithdrawalRow>) => (
      <View className="flex-row items-center gap-2 py-2 border-b border-theme">
        <Text className="text-[10.5px] text-secondary flex-shrink-0" style={{ width: 68 }}>
          {fmtShortDate(item.date)}
        </Text>
        <Text className="text-[10.5px] text-primary flex-1 min-w-0" numberOfLines={1}>
          {item.description}
        </Text>
        <Text className="text-[10.5px] font-semibold text-primary flex-shrink-0">{formatCurrency(item.amount)}</Text>
      </View>
    ),
    []
  );

  return (
    <Modal onClose={onClose}>
      <View style={{ height: modalBodyHeight }}>
        <View className="flex-row items-start gap-2 pb-2">
          <View className="flex-1 min-w-0">
            <Text className="text-sm font-extrabold text-primary" numberOfLines={1}>
              {fromLabel} <Text className="text-tertiary">→</Text> {toLabel}
            </Text>
            <Text className="text-[10px] text-tertiary" style={{ marginTop: 1 }}>
              {rows.length} row{rows.length !== 1 ? 's' : ''} · {formatCurrency(totalAmount)} total — every row this
              transfer will actually write
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
          <FlashList data={rows} keyExtractor={(_, i) => String(i)} renderItem={renderItem} drawDistance={500} />
        </View>
      </View>
    </Modal>
  );
}
