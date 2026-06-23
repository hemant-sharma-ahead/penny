import { useState, useEffect, useMemo, useCallback } from 'react';
import { accountsRepo, expensesRepo } from '@/core/db/repositories';
import type { Account, AccountType, Expense } from '@/core/db/types';
import { computeBalance } from '@/core/accounts/balanceCalculator';

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

  useEffect(() => {
    Promise.all([accountsRepo.getAll(), expensesRepo.getAll()]).then(([accs, exps]) => {
      setAccounts(accs.filter((a) => !a.isArchived).sort((a, b) => a.createdAt - b.createdAt));
      setTxns(exps);
    });
  }, []);

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
    setSaving(false);
  }, []);

  const deleteAccount = useCallback(async (id: string) => {
    await accountsRepo.delete(id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return { accounts, txns, saving, totalBalance, saveAccount, deleteAccount };
}
