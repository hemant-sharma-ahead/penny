import { useState } from 'react';
import { View, Text } from 'react-native';
import { Modal, Button, IconBadge } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatCurrency } from '@/lib/formatters';
import { formatDateShort } from '@/lib/date';
import type { DueRecurring } from '@/core/expenses/recurringDue';
import type { ExpenseCategory } from '@/core/db/types';

interface Props {
  due: DueRecurring[];
  categoryMap: Map<string, ExpenseCategory>;
  onPost: (d: DueRecurring) => Promise<void>;
  onSkip: (d: DueRecurring) => void;
  onClose: () => void;
}

/** "Due to log" inbox — confirm recurring items to post them as real transactions. */
export function RecurringInboxModal({ due, categoryMap, onPost, onSkip, onClose }: Props) {
  const theme = useThemeColors();
  const [busyId, setBusyId] = useState<string | null>(null);

  const handlePost = async (d: DueRecurring) => {
    setBusyId(d.key);
    try {
      await onPost(d);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal title="Due to log" onClose={onClose}>
      <Text className="text-sm text-secondary mb-3">
        These recurring items are due. Logging adds the transaction; the next one will surface when it falls due.
      </Text>
      <View className="gap-2">
        {due.map((d) => {
          const t = d.template;
          const cat = categoryMap.get(t.categoryId);
          const isIncome = (t.type ?? 'expense') === 'income';
          return (
            <View key={d.key} className="flex-row items-center gap-3 rounded-xl border border-theme bg-surface-2 p-3">
              <IconBadge icon={cat?.icon ?? 'ti-repeat'} color={cat?.color ?? theme.primary} size="sm" />
              <View className="flex-1 min-w-0">
                <Text className="text-sm font-medium text-primary" numberOfLines={1}>
                  {t.description}
                </Text>
                <Text className="text-xs text-tertiary">
                  Due {formatDateShort(d.dueMs)}
                  {d.periodsOverdue > 1 ? ` · ${d.periodsOverdue} pending` : ''}
                </Text>
              </View>
              <View className="items-end gap-1.5">
                <Text className="text-sm font-semibold" style={{ color: isIncome ? theme.success : undefined }}>
                  {isIncome ? '+' : ''}
                  {formatCurrency(t.amount)}
                </Text>
                <View className="flex-row gap-1.5">
                  <Button variant="ghost" size="sm" onPress={() => onSkip(d)} disabled={busyId === d.key}>
                    Skip
                  </Button>
                  <Button size="sm" loading={busyId === d.key} onPress={() => void handlePost(d)}>
                    Log
                  </Button>
                </View>
              </View>
            </View>
          );
        })}
        {due.length === 0 && <Text className="text-sm text-tertiary text-center py-4">Nothing due right now.</Text>}
      </View>
    </Modal>
  );
}
