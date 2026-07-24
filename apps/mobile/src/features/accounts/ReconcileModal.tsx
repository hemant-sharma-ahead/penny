import { useState } from 'react';
import { View, Text } from 'react-native';
import { Modal, Button, AmountInput, DetailRow } from '~/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { ink } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Account } from '@/core/db/types';

interface Props {
  account: Account;
  currentBalance: number;
  onReconcile: (account: Account, actual: number) => Promise<void> | void;
  onClose: () => void;
}

/** Adjust an account to its real-world balance — posts a balancing income/expense. */
export function ReconcileModal({ account, currentBalance, onReconcile, onClose }: Props) {
  const theme = useThemeColors();
  const [actual, setActual] = useState(String(Math.max(0, Math.round(currentBalance))));
  const actualNum = parseFloat(actual);
  const diff = !isNaN(actualNum) ? Math.round((actualNum - currentBalance) * 100) / 100 : 0;
  const hasDiff = Math.abs(diff) >= 1;
  const surplus = diff > 0;

  return (
    <Modal
      title={`Reconcile ${account.name}`}
      onClose={onClose}
      footer={
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button variant="secondary" fullWidth onPress={onClose}>
              Cancel
            </Button>
          </View>
          <View className="flex-1">
            <Button
              fullWidth
              disabled={!hasDiff}
              onPress={() => {
                void onReconcile(account, actualNum);
                onClose();
              }}
            >
              {hasDiff ? 'Reconcile' : 'Already matches'}
            </Button>
          </View>
        </View>
      }
    >
      <Text className="text-sm text-secondary mb-3">
        Count the actual balance in this account. Penny posts a small adjustment so the tracked balance matches reality.
      </Text>
      <View className="bg-surface rounded-xl px-4 py-1 mb-3">
        <DetailRow label="Tracked balance" value={formatCurrency(currentBalance)} size="md" />
      </View>
      <AmountInput label="Actual balance now" value={actual} onChange={setActual} autoFocus />
      {hasDiff && (
        <Text
          className="mt-3 text-xs"
          style={{ color: ink(surplus ? theme.success : theme.danger, theme.textPrimary) }}
        >
          Posts {surplus ? 'income' : 'an expense'} of {formatCurrency(Math.abs(diff))} ("Balance reconciliation") to
          {surplus ? ' add the surplus.' : ' cover the shortfall.'}
        </Text>
      )}
    </Modal>
  );
}
