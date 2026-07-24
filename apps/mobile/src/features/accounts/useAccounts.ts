import { useState, useEffect, useMemo, useCallback } from 'react';
import { accountsRepo, expensesRepo } from '@/core/db/repositories';
import type { Account, AccountType, Expense } from '@/core/db/types';
import { computeBalance } from '@/core/accounts/balanceCalculator';
import { logActivity, restoreActivity, summarizeDiff } from '@/core/db/activityLog';
import { useToast } from '~/context/ToastContext';
import { useTxnRefresh } from '@/hooks/useTxnRefresh';
import { useAccountsRefresh } from '@/hooks/useDataRefresh';

export interface AccountInput {
  name: string;
  type: AccountType;
  openingBalance: number;
  color: string;
  icon: string;
  includeInNetWorth: boolean;
}

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [txns, setTxns] = useState<Expense[]>([]);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const reload = useCallback(() => {
    Promise.all([accountsRepo.getAll(), expensesRepo.getAll()]).then(([accs, exps]) => {
      setAccounts(accs.filter((a) => !a.isArchived).sort((a, b) => a.createdAt - b.createdAt));
      setTxns(exps);
    });
  }, []);

  useEffect(() => reload(), [reload]);
  useTxnRefresh(reload);
  // Settings → Safe Mode edits accounts through a separately-mounted repo instance; reload here too.
  useAccountsRefresh(reload);

  const totalBalance = useMemo(
    () =>
      accounts.reduce(
        (sum, acc) => (acc.includeInNetWorth ? sum + computeBalance(acc.id, acc.openingBalance, txns) : sum),
        0
      ),
    [accounts, txns]
  );

  const saveAccount = useCallback(async (data: AccountInput, editing: Account | null) => {
    setSaving(true);
    const now = Date.now();
    const record: Account = editing
      ? { ...editing, ...data, updatedAt: now }
      : { id: crypto.randomUUID(), ...data, isArchived: false, createdAt: now, updatedAt: now };
    await accountsRepo.put(record);
    setAccounts((prev) => (editing ? prev.map((a) => (a.id === editing.id ? record : a)) : [...prev, record]));
    if (editing) {
      const diff = summarizeDiff(editing, record, ['name', 'type', 'openingBalance', 'includeInNetWorth']);
      logActivity({
        action: 'UPDATE',
        entityType: 'account',
        entityId: record.id,
        summary: `Updated account: ${record.name}`,
        ...(diff ? { diff } : {})
      });
    } else {
      logActivity({
        action: 'CREATE',
        entityType: 'account',
        entityId: record.id,
        summary: `Added account: ${record.name}`
      });
    }
    setSaving(false);
  }, []);

  const deleteAccount = useCallback(
    async (id: string) => {
      const acct = accounts.find((a) => a.id === id);
      await accountsRepo.delete(id);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      if (!acct) return;
      const logId = logActivity({
        action: 'DELETE',
        entityType: 'account',
        entityId: id,
        summary: `Deleted account: ${acct.name}`,
        snapshot: JSON.stringify(acct)
      });
      showToast({
        message: `Deleted account: ${acct.name}`,
        actionLabel: 'Undo',
        onAction: async () => {
          await restoreActivity(logId);
          setAccounts((prev) => [...prev, acct].sort((a, b) => a.createdAt - b.createdAt));
        }
      });
    },
    [accounts, showToast]
  );

  /**
   * Reconcile an account to its real-world balance by posting a balancing
   * adjustment transaction (income for a surplus, expense for a shortfall).
   */
  const reconcileAccount = useCallback(
    async (account: Account, actualBalance: number) => {
      const current = computeBalance(account.id, account.openingBalance, txns);
      const diff = Math.round((actualBalance - current) * 100) / 100;
      if (Math.abs(diff) < 1) return; // already matches
      const now = Date.now();
      const surplus = diff > 0;
      const adj: Expense = {
        id: crypto.randomUUID(),
        amount: Math.abs(diff),
        categoryId: surplus ? 'cat-inc-other' : 'cat-other',
        description: 'Balance reconciliation',
        date: now,
        hashtags: [],
        isRecurring: false,
        type: surplus ? 'income' : 'expense',
        accountId: account.id,
        source: 'manual',
        createdAt: now,
        updatedAt: now
      };
      await expensesRepo.put(adj);
      setTxns((prev) => [...prev, adj]);
      logActivity({
        action: 'CREATE',
        entityType: 'expense',
        entityId: adj.id,
        summary: `Reconciled ${account.name}: ${surplus ? '+' : '−'}₹${Math.abs(diff)}`
      });
    },
    [txns]
  );

  return { accounts, txns, saving, totalBalance, saveAccount, deleteAccount, reconcileAccount };
}
