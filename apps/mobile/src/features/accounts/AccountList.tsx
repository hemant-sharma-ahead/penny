import { useMemo, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import type { Account, Expense, ExpenseCategory, Hashtag } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { computeBalance } from '@/core/accounts/balanceCalculator';
import { getAccountMeta } from '@/core/accounts/meta';
import { Card, Button, ConfirmDialog, EmptyState, IconBadge, ListContainer } from '~/components/ui';
import { EntityTransactionsModal } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { ReconcileModal } from './ReconcileModal';
import { tint } from '~/lib/color';

interface AccountListProps {
  accounts: Account[];
  txns: Expense[];
  totalBalance: number;
  shouldMask: (sensitive: boolean | undefined) => boolean;
  categoryMap: Map<string, ExpenseCategory>;
  hashtags: Hashtag[];
  onAdd: () => void;
  onEdit: (acc: Account) => void;
  deleteAccount: (id: string) => Promise<unknown>;
  reconcileAccount: (account: Account, actual: number) => Promise<void> | void;
}

const RECONCILABLE = new Set<Account['type']>(['cash', 'wallet']);

export function AccountList({
  accounts,
  txns,
  totalBalance,
  shouldMask,
  categoryMap,
  hashtags,
  onAdd,
  onEdit,
  deleteAccount,
  reconcileAccount
}: AccountListProps) {
  const theme = useThemeColors();
  const totalMasked = shouldMask(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState<{ account: Account; balance: number } | null>(null);
  const [viewingAccount, setViewingAccount] = useState<Account | null>(null);
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  return (
    <View className="px-4 py-4 gap-3">
      {accounts.length > 0 && (
        <Card>
          <Text className="text-xs text-tertiary font-medium uppercase tracking-wide mb-1">Total Balance</Text>
          <Text className="text-2xl font-bold text-primary">
            {totalMasked ? '••••••' : formatCurrency(totalBalance)}
          </Text>
          <Text className="text-xs text-tertiary mt-0.5">
            Across {accounts.length} account{accounts.length !== 1 ? 's' : ''} in net worth
          </Text>
        </Card>
      )}

      {accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon="ti-wallet"
            title="No accounts yet"
            description="Add a cash wallet or bank account to start tracking balances."
            action={{ label: 'Add first account', onPress: onAdd, icon: 'ti-plus' }}
          />
        </Card>
      ) : (
        <ListContainer>
          {accounts.map((acc) => {
            const meta = getAccountMeta(acc.type);
            const balance = computeBalance(acc.id, acc.openingBalance, txns);
            const isNeg = balance < 0;
            const masked = shouldMask(acc.hideInSafeMode);
            return (
              <Pressable
                key={acc.id}
                onPress={() => setViewingAccount(acc)}
                className="px-4 py-3.5 flex-row items-center gap-3"
                accessibilityLabel={`View transactions for ${acc.name}`}
              >
                <IconBadge icon={acc.icon} color={acc.color} bg={tint(acc.color, 13)} />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-primary" numberOfLines={1}>
                    {acc.name}
                  </Text>
                  <Text className="text-xs text-tertiary">{meta.label}</Text>
                </View>
                <View className="items-end">
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: !masked && isNeg ? theme.danger : theme.textPrimary }}
                  >
                    {masked ? '••••' : formatCurrency(balance)}
                  </Text>
                  {acc.includeInNetWorth && <Text className="text-[10px] text-tertiary">in net worth</Text>}
                </View>
                <View className="w-5 h-5 rounded-full bg-surface-2 items-center justify-center">
                  <Icon name="ti-chevron-right" size={12} color={theme.textTertiary} />
                </View>
                {RECONCILABLE.has(acc.type) && (
                  <Button
                    variant="ghost"
                    icon="ti-scale"
                    accessibilityLabel="Reconcile balance"
                    className="w-8 h-8 rounded-lg"
                    onPress={() => setReconciling({ account: acc, balance })}
                  />
                )}
                <Button
                  variant="ghost"
                  icon="ti-pencil"
                  accessibilityLabel="Edit account"
                  className="w-8 h-8 rounded-lg"
                  onPress={() => onEdit(acc)}
                />
                <Button
                  variant="ghost"
                  icon="ti-trash"
                  accessibilityLabel="Delete account"
                  className="w-8 h-8 rounded-lg"
                  onPress={() => setDeletingId(acc.id)}
                />
              </Pressable>
            );
          })}
        </ListContainer>
      )}

      <ConfirmDialog
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={() => {
          if (deletingId) void deleteAccount(deletingId);
          setDeletingId(null);
        }}
        title="Delete account?"
        message="The account will be removed. Transactions linked to it will remain but will show no account."
        confirmLabel="Delete"
        confirmVariant="danger"
      />

      {reconciling && (
        <ReconcileModal
          account={reconciling.account}
          currentBalance={reconciling.balance}
          onReconcile={reconcileAccount}
          onClose={() => setReconciling(null)}
        />
      )}

      {viewingAccount && (
        <EntityTransactionsModal
          key={viewingAccount.id}
          title={viewingAccount.name}
          statLabel="Current balance"
          statValue={
            shouldMask(viewingAccount.hideInSafeMode)
              ? '••••'
              : formatCurrency(computeBalance(viewingAccount.id, viewingAccount.openingBalance, txns))
          }
          expenses={txns.filter((t) => t.accountId === viewingAccount.id || t.toAccountId === viewingAccount.id)}
          categoryMap={categoryMap}
          accountMap={accountMap}
          hashtags={hashtags}
          shouldMask={shouldMask}
          onClose={() => setViewingAccount(null)}
        />
      )}
    </View>
  );
}
