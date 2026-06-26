import { useState } from 'react';
import type { Account, Expense } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { computeBalance } from '@/core/accounts/balanceCalculator';
import { getAccountMeta } from '@/core/accounts/meta';
import { Card, Button, ConfirmDialog, EmptyState, IconBadge, ListContainer } from '@/components/ui';
import { STATUS } from '@/lib/statusColors';
import { ReconcileModal } from './ReconcileModal';

interface AccountListProps {
  accounts: Account[];
  txns: Expense[];
  totalBalance: number;
  mode: 'open' | 'safe' | 'privacy';
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
  mode,
  onAdd,
  onEdit,
  deleteAccount,
  reconcileAccount
}: AccountListProps) {
  const masked = mode !== 'open';
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState<{ account: Account; balance: number } | null>(null);

  return (
    <div className="px-4 py-4 flex flex-col gap-3 flex-1">
      {/* Total balance */}
      {accounts.length > 0 && (
        <Card>
          <p className="text-xs text-tertiary font-medium uppercase tracking-wide mb-1">Total Balance</p>
          <p className="text-2xl font-bold text-primary">{masked ? '••••••' : formatCurrency(totalBalance)}</p>
          <p className="text-xs text-tertiary mt-0.5">
            Across {accounts.length} account{accounts.length !== 1 ? 's' : ''} in net worth
          </p>
        </Card>
      )}

      {/* Account list */}
      {accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon="ti-wallet"
            title="No accounts yet"
            description="Add a cash wallet or bank account to start tracking balances."
            action={{ label: 'Add first account', onClick: onAdd, icon: 'ti-plus' }}
          />
        </Card>
      ) : (
        <ListContainer>
          {accounts.map((acc) => {
            const meta = getAccountMeta(acc.type);
            const balance = computeBalance(acc.id, acc.openingBalance, txns);
            const isNeg = balance < 0;
            return (
              <div key={acc.id} className="px-4 py-3.5 flex items-center gap-3">
                <IconBadge icon={acc.icon} color={acc.color} bg={acc.color + '20'} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-primary truncate">{acc.name}</p>
                  <p className="text-xs text-tertiary">{meta.label}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p
                    className="text-sm font-semibold"
                    style={{ color: !masked && isNeg ? STATUS.danger : 'var(--color-text-primary)' }}
                  >
                    {masked ? '••••' : formatCurrency(balance)}
                  </p>
                  {acc.includeInNetWorth && <p className="text-[10px] text-tertiary">in net worth</p>}
                </div>
                {RECONCILABLE.has(acc.type) && (
                  <Button
                    variant="ghost"
                    icon="ti-scale"
                    aria-label="Reconcile balance"
                    className="w-8 h-8 rounded-lg flex-shrink-0 hover:text-primary"
                    onClick={() => setReconciling({ account: acc, balance })}
                  />
                )}
                <Button
                  variant="ghost"
                  icon="ti-pencil"
                  aria-label="Edit account"
                  className="w-8 h-8 rounded-lg flex-shrink-0 hover:text-primary"
                  onClick={() => onEdit(acc)}
                />
                <Button
                  variant="ghost"
                  icon="ti-trash"
                  aria-label="Delete account"
                  className="w-8 h-8 rounded-lg flex-shrink-0 hover:text-danger"
                  onClick={() => setDeletingId(acc.id)}
                />
              </div>
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
    </div>
  );
}
