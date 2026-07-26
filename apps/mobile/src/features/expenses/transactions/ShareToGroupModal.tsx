import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Modal } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatCurrency } from '@/lib/formatters';
import type { Expense } from '@/core/db/types';

/**
 * RN port of apps/web-react/src/features/expenses/transactions/ShareToGroupModal.tsx. Share-later
 * picker (Track E, screen 9). A focused "Share with which group?" list opened from a transaction's row
 * action. Shares the expense as an equal split into the chosen group and marks the personal transaction
 * as shared — the transaction itself stays put; only a linked group event is added.
 */
export function ShareToGroupModal({
  expense,
  groups,
  onShare,
  onClose
}: {
  expense: Expense;
  groups: { id: string; name: string }[];
  onShare: (expense: Expense, groupId: string) => Promise<void>;
  onClose: () => void;
}) {
  const theme = useThemeColors();
  const [busy, setBusy] = useState(false);

  async function pick(groupId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await onShare(expense, groupId);
      onClose();
    } catch {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Share with a group">
      <View className="gap-3">
        <Text className="text-[13px] text-secondary -mt-1">
          Adds <Text className="text-primary font-bold">{expense.description}</Text> ({formatCurrency(expense.amount)})
          as an equal split. Your account still records the full amount.
        </Text>
        <View className="gap-1.5">
          {groups.map((g) => (
            <Pressable
              key={g.id}
              onPress={() => void pick(g.id)}
              disabled={busy}
              className="bg-surface border border-theme rounded-xl px-3 py-3 flex-row items-center gap-2.5"
              style={{ opacity: busy ? 0.5 : 1 }}
            >
              <Icon name="ti-users-group" size={16} color={theme.primary} />
              <Text className="text-sm font-medium text-primary flex-1">{g.name}</Text>
              <Icon name="ti-chevron-right" size={15} color={theme.textTertiary} />
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}
