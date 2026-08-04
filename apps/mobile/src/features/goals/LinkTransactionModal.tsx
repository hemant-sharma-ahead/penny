import { useMemo, useState } from 'react';
import { View, Pressable, ScrollView, Text } from 'react-native';
import type { Account, Expense } from '@/core/db/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { Modal, SearchInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';

interface LinkTransactionModalProps {
  goalName: string;
  /** Every transaction not already linked to any goal, newest-first. */
  candidates: Expense[];
  accountMap: Map<string, Account>;
  masked: boolean;
  onLink: (txn: Expense) => void;
  onClose: () => void;
}

/**
 * Retroactively tag an already-recorded transaction as a contribution toward this goal — the "Link
 * existing" footer action in `GoalDetailView.tsx`. Deliberately not virtualized (a search-filtered
 * modal list, not the main Transactions list) — capped to the 50 most recent matches, same tradeoff
 * `IouView.tsx`'s own pickers make for a bounded, infrequently-opened list.
 */
export function LinkTransactionModal({
  goalName,
  candidates,
  accountMap,
  masked,
  onLink,
  onClose
}: LinkTransactionModalProps) {
  const theme = useThemeColors();
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? candidates.filter((e) => e.description.toLowerCase().includes(q)) : candidates;
    return filtered.slice(0, 50);
  }, [candidates, query]);

  return (
    <Modal onClose={onClose} title={`Link a transaction to ${goalName}`} scrollable>
      <View className="gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search transactions…" />
        {matches.length === 0 && (
          <Text className="text-xs text-tertiary text-center py-6">
            {candidates.length === 0 ? 'No unlinked transactions to show.' : 'No matches for this search.'}
          </Text>
        )}
        <ScrollView style={{ maxHeight: 360 }}>
          <View className="gap-2">
            {matches.map((e) => {
              const acc = e.accountId ? accountMap.get(e.accountId) : undefined;
              const amountColor =
                e.type === 'income' ? theme.success : e.type === 'expense' ? theme.danger : theme.info;
              return (
                <Pressable
                  key={e.id}
                  onPress={() => onLink(e)}
                  className="flex-row items-center gap-3 rounded-xl px-3 py-2.5 bg-surface-2"
                >
                  <View
                    className="w-8 h-8 rounded-lg items-center justify-center shrink-0"
                    style={{ backgroundColor: tint(amountColor, 12) }}
                  >
                    <Icon name="ti-receipt" size={16} color={amountColor} />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-sm font-medium text-primary" numberOfLines={1}>
                      {e.description}
                    </Text>
                    <Text className="text-xs text-tertiary" numberOfLines={1}>
                      {formatDateShort(e.date)}
                      {acc?.name ? ` · ${acc.name}` : ''}
                    </Text>
                  </View>
                  <Text className="text-sm font-semibold" style={{ color: amountColor }}>
                    {masked ? '••••' : formatCurrency(e.amount)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
