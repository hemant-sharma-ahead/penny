import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { accountsRepo, expenseCategoriesRepo, expensesRepo, hashtagsRepo } from '@/core/db/repositories';
import type { Account, Expense } from '@/core/db/types';
import { computeBalance } from '@/core/accounts/balanceCalculator';
import { logActivity, restoreActivity, summarizeDiff } from '@/core/db/activityLog';
import { useToast } from '~/context/ToastContext';
import { useTxnRefresh, notifyTxnChanged } from '@/hooks/useTxnRefresh';
import {
  useAccountsRefresh,
  useCategoriesRefresh,
  useTagsRefresh,
  notifyAccountsChanged
} from '@/hooks/useDataRefresh';
import { useRepository } from '@/hooks/useRepository';
import type { AccountInput } from '~/hooks/useAccountForm';

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [txns, setTxns] = useState<Expense[]>([]);
  const [saving, setSaving] = useState(false);
  // True only until the very first load resolves — lets `AccountsPage`/`AccountList` show a real
  // loading state instead of silently reusing the "no accounts yet" empty prompt, which was
  // indistinguishable from "still loading" (both start as `[]`). Found 2026-08-28, real-device
  // performance pass — never flips back to `true` on a later `reload()` (a pull-to-refresh or
  // focus-triggered reload has real content to keep showing while it re-fetches).
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  // Read-only — just enough for the "view transactions for this account" drill-down
  // (`EntityTransactionsModal`) to render categories/tags the same way the Transactions tab does.
  const { items: categories, reload: reloadCategories } = useRepository(expenseCategoriesRepo);
  const { items: hashtags, reload: reloadHashtags } = useRepository(hashtagsRepo);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // Tracks the raw `accountsRepo.getAll()` reference last transformed into `accounts` — `.filter()`/
  // `.sort()` always allocate a NEW array, even when `accs` is the exact same (Tier 1-cached, unwritten
  // since last time) reference, so every `reload()` — including every screen-focus retrigger — was
  // giving `accounts` a new identity regardless of whether anything actually changed. Found 2026-08-28,
  // real-device testing: `useAccountVerification.ts`'s own `useMemo` keys off this exact `accounts`
  // reference and recomputes checkpoint diagnostics for EVERY account on each such change — for an
  // account with thousands of transactions, a real, avoidable cost on every single Accounts-tab focus.
  const lastAccsRef = useRef<Account[] | null>(null);
  const reload = useCallback(() => {
    Promise.all([accountsRepo.getAll(), expensesRepo.getAll()]).then(([accs, exps]) => {
      if (lastAccsRef.current !== accs) {
        lastAccsRef.current = accs;
        setAccounts(accs.filter((a) => !a.isArchived).sort((a, b) => a.createdAt - b.createdAt));
      }
      setTxns(exps);
      setLoading(false);
    });
  }, []);

  useEffect(() => reload(), [reload]);
  useTxnRefresh(reload);
  // Settings → Safe Mode edits accounts/categories/tags through separately-mounted repo instances.
  useAccountsRefresh(reload);
  useCategoriesRefresh(reloadCategories);
  useTagsRefresh(reloadHashtags);

  const totalBalance = useMemo(
    () =>
      accounts.reduce(
        (sum, acc) => (acc.includeInNetWorth ? sum + computeBalance(acc.id, acc.openingBalance, txns) : sum),
        0
      ),
    [accounts, txns]
  );

  // Cross-account `isDefault` exclusivity (2026-08-27) is handled entirely in the shared
  // `useAccountForm.ts` hook, not here — this same "save one account" callback is independently
  // re-implemented in `ExpenseForm.tsx`'s and `IouView.tsx`'s own inline "+ Add account" flows (no
  // cross-feature imports means each feature module needs its own), so the invariant has to live at
  // the one point that's genuinely shared by all of them: `useAccountForm.save()` calls THIS callback
  // a second time, for whichever other account previously held the default, instead of every
  // `saveAccount` implementation needing to remember to do it itself.
  const saveAccount = useCallback(async (data: AccountInput, editing: Account | null) => {
    setSaving(true);
    const now = Date.now();
    // `bankId`/`last4` are stripped from `editing` before the merge (not just spread over) so that
    // CLEARING either field in the form (an omitted key on `data`, never an explicit `undefined` —
    // exactOptionalPropertyTypes disallows that) actually removes it from the saved record, instead of
    // a plain `{ ...editing, ...data }` silently keeping the old value forever once first set.
    const record: Account = editing
      ? (() => {
          const { bankId: _oldBankId, last4: _oldLast4, ...editingRest } = editing;
          void _oldBankId;
          void _oldLast4;
          return { ...editingRest, ...data, updatedAt: now };
        })()
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
    notifyAccountsChanged();
    setSaving(false);
    return record;
  }, []);

  const deleteAccount = useCallback(
    async (id: string) => {
      const acct = accounts.find((a) => a.id === id);
      await accountsRepo.delete(id);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      notifyAccountsChanged();
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
          notifyAccountsChanged();
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
      notifyTxnChanged();
    },
    [txns]
  );

  return {
    accounts,
    txns,
    saving,
    loading,
    totalBalance,
    saveAccount,
    deleteAccount,
    reconcileAccount,
    categoryMap,
    hashtags,
    reload
  };
}
