import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  accountsRepo,
  bankStatementImportsRepo,
  budgetsRepo,
  expenseCategoriesRepo,
  expensesRepo,
  goalContributionsRepo,
  goalsRepo,
  hashtagsRepo,
  ledgerEntriesRepo,
  merchantMemoryRepo,
  personsRepo,
  transactionTemplatesRepo
} from '@/core/db/repositories';
import type {
  Account,
  Expense,
  ExpenseCategory,
  Goal,
  GoalContribution,
  MerchantMemory,
  Person,
  TransactionTemplate,
  TransactionType
} from '@/core/db/types';
import { reconcileExpenseLink, type ExpenseIouIntent, type ExpenseSeedIntent } from '@/core/iou/expenseLink';
import { reconcileGoalLink, type ExpenseGoalIntent } from '@/core/goals/goalLink';
import { useRepository } from '@/hooks/useRepository';
import { useTxnRefresh, notifyTxnChanged } from '@/hooks/useTxnRefresh';
import {
  useCategoriesRefresh,
  useTagsRefresh,
  useAccountsRefresh,
  notifyAccountsChanged
} from '@/hooks/useDataRefresh';
import type { AccountInput } from '~/hooks/useAccountForm';
import { ALL_DEFAULT_CATEGORIES, CATEGORY_MIGRATION_MAP } from '@/core/db/defaultCategories';
import { dedupeDemoCategories, reconcileDefaultCategories, repairCategoryIcons } from '@/core/db/dedupeDemoCategories';
import { calcSpendByCategory, calcTxnCountByCategory } from '@/core/expenses/filterAndAggregate';
import { computeBalance } from '@/core/accounts/balanceCalculator';
import { buildParentCategoryMap } from '@/core/expenses/categoryGroups';
import {
  buildMemoriesFromExpenses,
  buildMemory,
  memoryKey,
  searchMerchantMemories
} from '@/core/expenses/merchantMemory';
import { computeDueRecurring, buildOccurrence, type DueRecurring } from '@/core/expenses/recurringDue';
import { normalizeHashtag } from '~/context/EventModeContext';
import { logActivity, restoreActivity, summarizeDiff } from '@/core/db/activityLog';
import { inferPaymentMode } from '@/core/bank-import/paymentModeInference';
import { useToast } from '~/context/ToastContext';
import { getItem, setItem, getJSON, setJSON, removeItem } from '~/lib/storage';

const expenseSummary = (verb: string, e: Expense) => `${verb} ${e.type}: ${e.description} ₹${e.amount}`;

/**
 * RN port of apps/web-react/src/features/expenses/useExpenses.ts — same logic, unchanged, except every
 * one-time migration/seeding effect's synchronous `localStorage` check becomes an async `~/lib/storage`
 * (AsyncStorage) check inside the same effect. Each effect already gates on a `*Ref` flag + reload-driven
 * re-render, so making the storage check async (instead of synchronous-then-effect) just shifts the
 * "have I already migrated" check from render-time to a `.then()`, with no behavior change.
 */
export function useExpenses() {
  const { showToast } = useToast();
  const {
    items: expenses,
    loading: expensesLoading,
    save: saveExpense,
    remove: removeExpense,
    reload: reloadExpenses
  } = useRepository(expensesRepo);
  const {
    items: categories,
    loading: categoriesLoading,
    reload: reloadCategories
  } = useRepository(expenseCategoriesRepo);
  const { items: hashtags, save: saveHashtag, reload: reloadHashtags } = useRepository(hashtagsRepo);
  const { items: accounts, reload: reloadAccounts } = useRepository(accountsRepo);
  // The Accounts page (or Settings → Safe Mode) writes accounts through a separately-mounted repo
  // instance — including the inline "+ Add account" in ExpenseForm.tsx's own account chips; reload here
  // too so this screen's account list stays live without needing to remount.
  useAccountsRefresh(reloadAccounts);

  // Add an account from inside the expense form's own "+" tile (`AccountChips.tsx`), without leaving
  // it. Mirrors `useAccounts.ts`'s own `saveAccount` (same shape, same repo) — that hook can't be
  // imported here directly (a feature module importing another feature module's hook), so this is a
  // second, independent implementation of the same mutation rather than a shared one; `notifyAccountsChanged()`
  // is what keeps the two in sync afterward, the same signal Settings → Safe Mode's own account edits
  // already rely on.
  const saveAccount = useCallback(async (data: AccountInput, editing: Account | null): Promise<Account> => {
    const now = Date.now();
    const record: Account = editing
      ? { ...editing, ...data, updatedAt: now }
      : { id: crypto.randomUUID(), ...data, isArchived: false, createdAt: now, updatedAt: now };
    await accountsRepo.put(record);
    logActivity({
      action: editing ? 'UPDATE' : 'CREATE',
      entityType: 'account',
      entityId: record.id,
      summary: `${editing ? 'Updated' : 'Added'} account: ${record.name}`
    });
    notifyAccountsChanged();
    return record;
  }, []);
  const { items: persons, reload: reloadPersons } = useRepository<Person>(personsRepo);
  const { items: ledgerEntries, reload: reloadLedger } = useRepository(ledgerEntriesRepo);
  const { items: goals, reload: reloadGoals } = useRepository<Goal>(goalsRepo);
  const { items: goalContributions, reload: reloadGoalContributions } =
    useRepository<GoalContribution>(goalContributionsRepo);
  // Read-only — just enough for the edit form's "matched from bank statement" audit-trail caption
  // (docs/plans/bank-statement-import.md §10a's purpose #1). Bank Statement Import itself owns writing
  // to this store (`features/bank-import/useBankImport.ts`'s `commitAndImport`); this is a separate,
  // independently-mounted read of the same repo, same pattern as `ledgerEntries`/`goalContributions`.
  const { items: bankStatementImportRecords } = useRepository(bankStatementImportsRepo);

  // The IOU/Goals screens write expenses/ledger entries/contributions through separate repo instances;
  // reload on their signal.
  const refreshTxnData = useCallback(() => {
    reloadExpenses();
    reloadLedger();
    reloadPersons();
    reloadGoals();
    reloadGoalContributions();
  }, [reloadExpenses, reloadLedger, reloadPersons, reloadGoals, reloadGoalContributions]);
  useTxnRefresh(refreshTxnData);
  // Settings → Safe Mode edits categories through a separately-mounted repo instance; reload here too.
  useCategoriesRefresh(reloadCategories);
  // Settings → Safe Mode → Tags and Manage Tags edit tags through separately-mounted repo instances.
  useTagsRefresh(reloadHashtags);
  const { items: merchantMemories, reload: reloadMerchantMemory } = useRepository(merchantMemoryRepo);
  const { items: templates, save: saveTemplateRepo, remove: removeTemplate } = useRepository(transactionTemplatesRepo);

  // Category v2 migration: seeds default categories and patches any that lack intentGroup
  const seededRef = useRef(false);
  useEffect(() => {
    if (categoriesLoading) return;
    if (seededRef.current) return;
    seededRef.current = true;
    (async () => {
      const flag = await getItem('penny_cats_v2');
      const needsMigration = !flag || categories.some((c) => c.isDefault && !c.intentGroup);
      if (!needsMigration) return;
      const now = Date.now();
      const toSeed = ALL_DEFAULT_CATEGORIES.map((c) => {
        const existing = categories.find((x) => x.id === c.id);
        return { ...c, createdAt: existing?.createdAt ?? now };
      });
      const toPatch = categories
        .filter((c) => !c.intentGroup)
        .map((c) => {
          const targetId = CATEGORY_MIGRATION_MAP[c.name.toLowerCase()];
          const target = ALL_DEFAULT_CATEGORIES.find((x) => x.id === targetId);
          return {
            ...c,
            intentGroup: target?.intentGroup ?? 'other',
            applicableTo: c.applicableTo ?? ('expense' as const)
          };
        });
      await Promise.all([...toSeed, ...toPatch].map((c) => expenseCategoriesRepo.put(c)));
      await setItem('penny_cats_v2', '1');
      reloadCategories();
    })().catch(() => {});
  }, [categoriesLoading, categories, reloadCategories]);

  // Additive default-category seeding (v3): inserts any default categories the user is missing
  // (e.g. the Sin Goods categories added in Track 7) WITHOUT re-putting existing ones, so user
  // edits to default categories are never clobbered. Re-runs once per version bump.
  const catSeedRef = useRef(false);
  useEffect(() => {
    if (categoriesLoading || catSeedRef.current) return;
    catSeedRef.current = true;
    (async () => {
      if (await getItem('penny_cats_v3')) return;
      const existingIds = new Set(categories.map((c) => c.id));
      const missing = ALL_DEFAULT_CATEGORIES.filter((c) => !existingIds.has(c.id));
      await Promise.all(missing.map((c) => expenseCategoriesRepo.put({ ...c, createdAt: Date.now() })));
      await setItem('penny_cats_v3', '1');
      if (missing.length > 0) reloadCategories();
    })().catch(() => {});
  }, [categoriesLoading, categories, reloadCategories]);

  // Additive default-category seeding (v5): inserts the Track E category additions — the Legal intent
  // group, plus new Travel (Trip Prep/Shopping, Fuel, Vehicle Service) and Education (Transportation
  // Fee, School Trip, Competition) categories. Same non-clobbering, once-per-version pattern as v3.
  const catSeedV5Ref = useRef(false);
  useEffect(() => {
    if (categoriesLoading || catSeedV5Ref.current) return;
    catSeedV5Ref.current = true;
    (async () => {
      if (await getItem('penny_cats_v6')) return;
      const existingIds = new Set(categories.map((c) => c.id));
      const missing = ALL_DEFAULT_CATEGORIES.filter((c) => !existingIds.has(c.id));
      await Promise.all(missing.map((c) => expenseCategoriesRepo.put({ ...c, createdAt: Date.now() })));
      await setItem('penny_cats_v6', '1');
      if (missing.length > 0) reloadCategories();
    })().catch(() => {});
  }, [categoriesLoading, categories, reloadCategories]);

  // Additive default-category seeding (v7): inserts the Family & Giving "Miscellaneous" category. Same
  // non-clobbering, once-per-version pattern as v3/v6.
  const catSeedV7Ref = useRef(false);
  useEffect(() => {
    if (categoriesLoading || catSeedV7Ref.current) return;
    catSeedV7Ref.current = true;
    (async () => {
      if (await getItem('penny_cats_v7')) return;
      const existingIds = new Set(categories.map((c) => c.id));
      const missing = ALL_DEFAULT_CATEGORIES.filter((c) => !existingIds.has(c.id));
      await Promise.all(missing.map((c) => expenseCategoriesRepo.put({ ...c, createdAt: Date.now() })));
      await setItem('penny_cats_v7', '1');
      if (missing.length > 0) reloadCategories();
    })().catch(() => {});
  }, [categoriesLoading, categories, reloadCategories]);

  // Additive default-category seeding (v8): inserts Food & Drinks (Daily Living), Lending (Family &
  // Giving), and Borrowed Money (Income) — added 2026-08-03 for the bank-import Lent/Borrowed flow.
  // Same non-clobbering, once-per-version pattern as v3/v6/v7.
  const catSeedV8Ref = useRef(false);
  useEffect(() => {
    if (categoriesLoading || catSeedV8Ref.current) return;
    catSeedV8Ref.current = true;
    (async () => {
      if (await getItem('penny_cats_v8')) return;
      const existingIds = new Set(categories.map((c) => c.id));
      const missing = ALL_DEFAULT_CATEGORIES.filter((c) => !existingIds.has(c.id));
      await Promise.all(missing.map((c) => expenseCategoriesRepo.put({ ...c, createdAt: Date.now() })));
      await setItem('penny_cats_v8', '1');
      if (missing.length > 0) reloadCategories();
    })().catch(() => {});
  }, [categoriesLoading, categories, reloadCategories]);

  // Additive default-category seeding (v9): inserts Cash Income (Income) — added 2026-08-05. Same
  // non-clobbering, once-per-version pattern as v3/v6/v7/v8.
  const catSeedV9Ref = useRef(false);
  useEffect(() => {
    if (categoriesLoading || catSeedV9Ref.current) return;
    catSeedV9Ref.current = true;
    (async () => {
      if (await getItem('penny_cats_v9')) return;
      const existingIds = new Set(categories.map((c) => c.id));
      const missing = ALL_DEFAULT_CATEGORIES.filter((c) => !existingIds.has(c.id));
      await Promise.all(missing.map((c) => expenseCategoriesRepo.put({ ...c, createdAt: Date.now() })));
      await setItem('penny_cats_v9', '1');
      if (missing.length > 0) reloadCategories();
    })().catch(() => {});
  }, [categoriesLoading, categories, reloadCategories]);

  // Additive default-category seeding (v10): inserts Collected Money (Income) and Return Borrowed
  // (Family & Giving) — added 2026-08-06 for the IOU settle-flow default categories and the new
  // mandatory-person rule (`IOU_MANDATORY_CATEGORY_IDS`). Same non-clobbering, once-per-version
  // pattern as v3/v6/v7/v8/v9 — adding the entries to `ALL_DEFAULT_CATEGORIES` alone does nothing for
  // an already-seeded database; only a new versioned effect like this one actually inserts them.
  const catSeedV10Ref = useRef(false);
  useEffect(() => {
    if (categoriesLoading || catSeedV10Ref.current) return;
    catSeedV10Ref.current = true;
    (async () => {
      if (await getItem('penny_cats_v10')) return;
      const existingIds = new Set(categories.map((c) => c.id));
      const missing = ALL_DEFAULT_CATEGORIES.filter((c) => !existingIds.has(c.id));
      await Promise.all(missing.map((c) => expenseCategoriesRepo.put({ ...c, createdAt: Date.now() })));
      await setItem('penny_cats_v10', '1');
      if (missing.length > 0) reloadCategories();
    })().catch(() => {});
  }, [categoriesLoading, categories, reloadCategories]);

  // Additive default-category seeding (v11): inserts Charges & Fees (Financial) — added 2026-08-09 for
  // the bank-import balance-sync work (real statements routinely surface small bank-initiated debits —
  // SMS alert charges, AMC/annual fees, NEFT/IMPS charges — that don't fit any existing Financial
  // category). Same non-clobbering, once-per-version pattern as v3/v6/v7/v8/v9/v10.
  const catSeedV11Ref = useRef(false);
  useEffect(() => {
    if (categoriesLoading || catSeedV11Ref.current) return;
    catSeedV11Ref.current = true;
    (async () => {
      if (await getItem('penny_cats_v11')) return;
      const existingIds = new Set(categories.map((c) => c.id));
      const missing = ALL_DEFAULT_CATEGORIES.filter((c) => !existingIds.has(c.id));
      await Promise.all(missing.map((c) => expenseCategoriesRepo.put({ ...c, createdAt: Date.now() })));
      await setItem('penny_cats_v11', '1');
      if (missing.length > 0) reloadCategories();
    })().catch(() => {});
  }, [categoriesLoading, categories, reloadCategories]);

  // One-time icon fix for v10's two categories (2026-08-06): the very first version of this seeding
  // effect shipped with invented, non-existent icon names (`ti-wallet-plus`/`ti-wallet-minus` — not in
  // the actual bundled Tabler set), and a Fast-Refresh-connected device could easily have already run
  // the v10 seed above with those wrong values before the fix landed, permanently setting the
  // `penny_cats_v10` flag against broken data. Unconditional (not flag-gated on v10 itself, which
  // would never re-run) — directly patches these two ids' `icon` field to the corrected value if it
  // doesn't already match, a no-op for anyone who only ever saw the fixed version.
  const catIconFixRef = useRef(false);
  useEffect(() => {
    if (categoriesLoading || catIconFixRef.current) return;
    catIconFixRef.current = true;
    (async () => {
      const correctIcons: Record<string, string> = {
        'cat-collected-money': 'ti-receipt-refund',
        'cat-return-borrowed': 'ti-cash-minus'
      };
      const toFix = categories.filter((c) => correctIcons[c.id] && c.icon !== correctIcons[c.id]);
      await Promise.all(toFix.map((c) => expenseCategoriesRepo.put({ ...c, icon: correctIcons[c.id] as string })));
      if (toFix.length > 0) reloadCategories();
    })().catch(() => {});
  }, [categoriesLoading, categories, reloadCategories]);

  // One-time cleanup: databases seeded before the demo seed reused the real defaults carry duplicate
  // `demo-cat-*` categories. Remap their references to the canonical default and delete them, so the
  // picker stops showing each staple twice. Runs once, only when a legacy demo category is present.
  const demoDedupeRef = useRef(false);
  useEffect(() => {
    if (categoriesLoading || demoDedupeRef.current) return;
    demoDedupeRef.current = true;
    (async () => {
      if (await getItem('penny_demo_cats_deduped')) return;
      const hasLegacy = categories.some((c) => c.id.startsWith('demo-cat-'));
      if (!hasLegacy) {
        await setItem('penny_demo_cats_deduped', '1');
        return;
      }
      const { remapped } = await dedupeDemoCategories();
      await setItem('penny_demo_cats_deduped', '1');
      reloadCategories();
      if (remapped > 0) reloadExpenses();
    })().catch(() => {});
  }, [categoriesLoading, categories, reloadCategories, reloadExpenses]);

  // One-time icon repair: heals default categories seeded with icons that are absent from the shipped
  // webfont (they render blank) — e.g. Savings Transfer (ti-piggy-bank), Food on Trip (ti-fork).
  // Definition changes don't reach already-seeded records, so patch them in place.
  const iconRepairRef = useRef(false);
  useEffect(() => {
    if (categoriesLoading || iconRepairRef.current) return;
    iconRepairRef.current = true;
    (async () => {
      if (await getItem('penny_cat_icons_v1')) return;
      const [fixed, reconciled] = await Promise.all([repairCategoryIcons(), reconcileDefaultCategories()]);
      await setItem('penny_cat_icons_v1', '1');
      if (fixed > 0 || reconciled > 0) reloadCategories();
    })().catch(() => {});
  }, [categoriesLoading, reloadCategories]);

  // One-time merchant-memory backfill from existing transactions, so suggestions
  // work immediately on upgrade. v2 re-keys records by merchant + category, so on
  // migration we clear any v1 records and rebuild.
  const backfilledRef = useRef(false);
  useEffect(() => {
    if (backfilledRef.current || expensesLoading) return;
    backfilledRef.current = true;
    (async () => {
      if (await getItem('penny_merchant_memory_v2')) return;
      const existing = await merchantMemoryRepo.getAll();
      await Promise.all(existing.map((m) => merchantMemoryRepo.delete(m.id)));
      const memories = buildMemoriesFromExpenses(expenses);
      await Promise.all(memories.map((m) => merchantMemoryRepo.put(m)));
      await setItem('penny_merchant_memory_v2', '1');
      await removeItem('penny_merchant_memory_v1');
      reloadMerchantMemory();
    })().catch(() => {});
  }, [expensesLoading, expenses, reloadMerchantMemory]);

  const expenseCategories = useMemo(
    () => categories.filter((c) => !c.isGroup && (!c.applicableTo || c.applicableTo === 'expense')),
    [categories]
  );

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const parentCategoryMap = useMemo(() => buildParentCategoryMap(categories), [categories]);
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const merchantMemoryMap = useMemo(() => new Map(merchantMemories.map((m) => [m.id, m])), [merchantMemories]);

  /** Type-ahead search of remembered merchants (ranked; one row per merchant+category). */
  const searchMerchant = useCallback(
    (type: TransactionType, query: string): MerchantMemory[] => searchMerchantMemories(merchantMemories, type, query),
    [merchantMemories]
  );
  const spendByCategory = useMemo(() => calcSpendByCategory(expenses), [expenses]);
  const txnCountByCategory = useMemo(() => calcTxnCountByCategory(expenses), [expenses]);

  // ── Category management mutations ──────────────────────────────────────────
  const saveCategory = useCallback(
    async (cat: ExpenseCategory) => {
      const existing = categories.find((c) => c.id === cat.id);
      await expenseCategoriesRepo.put(cat);
      reloadCategories();
      const diff = existing
        ? summarizeDiff(existing, cat, ['name', 'color', 'icon', 'intentGroup', 'parentId'])
        : undefined;
      logActivity({
        action: existing ? 'UPDATE' : 'CREATE',
        entityType: 'category',
        entityId: cat.id,
        summary: `${existing ? 'Updated' : 'Added'} category: ${cat.name}`,
        ...(diff ? { diff } : {})
      });
    },
    [categories, reloadCategories]
  );

  /** Reassign every transaction in `sourceIds` to `targetId`. Sources are not deleted. */
  const moveTransactions = useCallback(
    async (sourceIds: string[], targetId: string) => {
      const sources = new Set(sourceIds);
      const now = Date.now();
      const affected = expenses.filter((e) => sources.has(e.categoryId));
      await Promise.all(affected.map((e) => expensesRepo.put({ ...e, categoryId: targetId, updatedAt: now })));
      reloadExpenses();
      if (affected.length > 0) {
        logActivity({
          action: 'BULK_MOVE',
          entityType: 'expense',
          entityId: targetId,
          summary: `Moved ${affected.length} transaction${affected.length === 1 ? '' : 's'} to another category`,
          entityCount: affected.length
        });
      }
    },
    [expenses, reloadExpenses]
  );

  /** Apply a partial field update to specific transactions (by id) in one batch. */
  const patchExpenses = useCallback(
    async (expenseIds: string[], patch: Partial<Pick<Expense, 'categoryId' | 'accountId' | 'paymentMode'>>) => {
      const ids = new Set(expenseIds);
      const now = Date.now();
      const affected = expenses.filter((e) => ids.has(e.id));
      await Promise.all(affected.map((e) => expensesRepo.put({ ...e, ...patch, updatedAt: now })));
      reloadExpenses();
      const first = affected[0];
      if (first) {
        logActivity({
          action: patch.categoryId ? 'BULK_MOVE' : 'BULK_UPDATE',
          entityType: 'expense',
          entityId: first.id,
          summary: `Updated ${affected.length} transaction${affected.length === 1 ? '' : 's'}`,
          entityCount: affected.length
        });
      }
    },
    [expenses, reloadExpenses]
  );

  /** Delete specific transactions (by id) in one batch, with Undo. */
  const removeExpenses = useCallback(
    async (expenseIds: string[]) => {
      const ids = new Set(expenseIds);
      const removed = expenses.filter((e) => ids.has(e.id));
      // Cascade-delete any IOU ledger entries linked to these transactions (parity with single delete),
      // so bulk-deleting IOU-seeded expenses doesn't leave orphaned ledger entries.
      const linkedEntries = (await ledgerEntriesRepo.getAll()).filter(
        (le) => le.linkedTxnId !== undefined && ids.has(le.linkedTxnId)
      );
      await Promise.all(expenseIds.map((id) => expensesRepo.delete(id)));
      for (const le of linkedEntries) await ledgerEntriesRepo.delete(le.id);
      reloadExpenses();
      if (linkedEntries.length > 0) reloadLedger();
      // Unconditional — any transaction delete can change account balances/net worth, not just
      // IOU-linked ones (found 2026-08-04: Home's net-worth figure went stale after deleting ordinary,
      // non-IOU-linked transactions, since this used to only fire inside the linked-entries branch).
      notifyTxnChanged();
      const first = removed[0];
      if (!first) return;
      const label = `${removed.length} transaction${removed.length === 1 ? '' : 's'}`;
      const logId = logActivity({
        action: 'BULK_DELETE',
        entityType: 'expense',
        entityId: first.id,
        summary: `Deleted ${label}`,
        snapshot: JSON.stringify(removed),
        entityCount: removed.length,
        ...(linkedEntries.length > 0
          ? { cascade: JSON.stringify(linkedEntries.map((le) => ({ entityType: 'ledgerEntry', record: le }))) }
          : {})
      });
      showToast({
        message: `Deleted ${label}`,
        actionLabel: 'Undo',
        onAction: async () => {
          await restoreActivity(logId);
          reloadExpenses();
          if (linkedEntries.length > 0) reloadLedger();
          notifyTxnChanged();
        }
      });
    },
    [expenses, reloadExpenses, reloadLedger, showToast]
  );

  /** Delete a single transaction, with Undo. Cascade-deletes linked IOU entries and restores both atomically. */
  const deleteExpense = useCallback(
    async (id: string) => {
      const exp = expenses.find((e) => e.id === id);
      await removeExpense(id);
      // Cascade-delete any IOU ledger entries linked to this transaction.
      const linkedEntries = (await ledgerEntriesRepo.getAll()).filter((le) => le.linkedTxnId === id);
      for (const le of linkedEntries) await ledgerEntriesRepo.delete(le.id);
      if (linkedEntries.length > 0) reloadLedger();
      // Unconditional — see removeExpenses' own note above; this used to only fire for IOU-linked
      // deletes, leaving Home's net-worth figure stale after an ordinary transaction delete.
      notifyTxnChanged();
      if (!exp) return;
      const logId = logActivity({
        action: 'DELETE',
        entityType: 'expense',
        entityId: id,
        summary: expenseSummary('Deleted', exp),
        snapshot: JSON.stringify(exp),
        ...(linkedEntries.length > 0
          ? { cascade: JSON.stringify(linkedEntries.map((le) => ({ entityType: 'ledgerEntry', record: le }))) }
          : {})
      });
      showToast({
        message: `Deleted ${exp.description}`,
        actionLabel: 'Undo',
        onAction: async () => {
          await restoreActivity(logId);
          reloadExpenses();
          if (linkedEntries.length > 0) reloadLedger();
          notifyTxnChanged();
        }
      });
    },
    [expenses, removeExpense, reloadExpenses, reloadLedger, showToast]
  );

  /** Delete a custom, empty category and any budgets attached to it. No-op for defaults or non-empty. */
  const deleteCategory = useCallback(
    async (id: string) => {
      const cat = categories.find((c) => c.id === id);
      if (!cat || cat.isDefault) return;
      if ((txnCountByCategory.get(id) ?? 0) > 0) return;
      const budgets = await budgetsRepo.getAll();
      await Promise.all(budgets.filter((b) => b.categoryId === id).map((b) => budgetsRepo.delete(b.id)));
      await expenseCategoriesRepo.delete(id);
      reloadCategories();
      const logId = logActivity({
        action: 'DELETE',
        entityType: 'category',
        entityId: id,
        summary: `Deleted category: ${cat.name}`,
        snapshot: JSON.stringify(cat)
      });
      showToast({
        message: `Deleted category: ${cat.name}`,
        actionLabel: 'Undo',
        onAction: async () => {
          await restoreActivity(logId);
          reloadCategories();
        }
      });
    },
    [categories, txnCountByCategory, reloadCategories, showToast]
  );

  const saveParent = useCallback(
    async (parent: ExpenseCategory) => {
      const existing = categories.find((c) => c.id === parent.id);
      await expenseCategoriesRepo.put({ ...parent, isGroup: true });
      reloadCategories();
      logActivity({
        action: existing ? 'UPDATE' : 'CREATE',
        entityType: 'category',
        entityId: parent.id,
        summary: `${existing ? 'Updated' : 'Added'} group: ${parent.name}`
      });
    },
    [categories, reloadCategories]
  );

  /** Delete a parent that has no children. No-op otherwise. */
  const deleteParent = useCallback(
    async (id: string) => {
      if (categories.some((c) => c.parentId === id)) return;
      const parent = categories.find((c) => c.id === id);
      await expenseCategoriesRepo.delete(id);
      reloadCategories();
      if (!parent) return;
      const logId = logActivity({
        action: 'DELETE',
        entityType: 'category',
        entityId: id,
        summary: `Deleted group: ${parent.name}`,
        snapshot: JSON.stringify(parent)
      });
      showToast({
        message: `Deleted group: ${parent.name}`,
        actionLabel: 'Undo',
        onAction: async () => {
          await restoreActivity(logId);
          reloadCategories();
        }
      });
    },
    [categories, reloadCategories, showToast]
  );

  /** Create a parent group plus its mandatory ≥1 child categories in one go. */
  const createParentWithChildren = useCallback(
    async (parent: ExpenseCategory, children: ExpenseCategory[]) => {
      if (children.length === 0) return;
      await expenseCategoriesRepo.put({ ...parent, isGroup: true });
      await Promise.all(children.map((c) => expenseCategoriesRepo.put({ ...c, parentId: parent.id })));
      reloadCategories();
      logActivity({
        action: 'CREATE',
        entityType: 'category',
        entityId: parent.id,
        summary: `Added group: ${parent.name} (${children.length} categor${children.length === 1 ? 'y' : 'ies'})`,
        entityCount: children.length + 1
      });
    },
    [reloadCategories]
  );

  const linkedCountByEventHashtag = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      for (const tag of e.hashtags) {
        const norm = normalizeHashtag(tag);
        map.set(norm, (map.get(norm) ?? 0) + 1);
      }
    }
    return map;
  }, [expenses]);

  // Compound mutation: saves the expense and upserts all hashtag usage counts atomically. `newTagSetAside`
  // carries the Set Aside choice made inline in the form for any tag being created for the first time —
  // ignored for tags that already exist (their classification only changes via Manage Tags).
  const saveExpenseWithHashtags = useCallback(
    async (expense: Expense, newTagSetAside?: Record<string, boolean>) => {
      const existing = expenses.find((e) => e.id === expense.id);
      await saveExpense(expense);
      // Found + fixed 2026-08-10, on-device testing: this is the canonical single-expense add/edit
      // path (every `ExpenseForm` save goes through here) but never broadcast `notifyTxnChanged()` —
      // every OTHER mutation in this file does (bulk ops, IOU-linked writes). A separately-mounted
      // `useRepository(expensesRepo)` consumer (e.g. `FullLedgerPage.tsx`/`CheckpointTimelinePage.tsx`
      // staying mounted in the background) never learned a plain manual entry/edit just happened, and
      // kept showing stale data — a back-dated transaction recorded elsewhere never appeared in an
      // already-open Full Ledger until that screen happened to remount.
      notifyTxnChanged();
      for (const tag of expense.hashtags) {
        const existingTag = hashtags.find((h) => h.name === tag);
        if (existingTag) {
          await saveHashtag({ ...existingTag, usageCount: existingTag.usageCount + 1 });
        } else {
          const setAside = newTagSetAside?.[tag] ?? false;
          await saveHashtag({
            id: crypto.randomUUID(),
            name: tag,
            usageCount: 1,
            setAside,
            hideInSafeMode: setAside,
            createdAt: Date.now()
          });
        }
      }
      // Remember this merchant's category/account/payment for next-time suggestions.
      const memory = buildMemory(
        expense,
        merchantMemoryMap.get(memoryKey(expense.type ?? 'expense', expense.description, expense.categoryId))
      );
      if (memory) {
        await merchantMemoryRepo.put(memory);
        reloadMerchantMemory();
      }
      const diff = existing
        ? summarizeDiff(existing, expense, ['amount', 'categoryId', 'description', 'accountId', 'paymentMode', 'date'])
        : undefined;
      logActivity({
        action: existing ? 'UPDATE' : 'CREATE',
        entityType: 'expense',
        entityId: expense.id,
        summary: expenseSummary(existing ? 'Updated' : 'Added', expense),
        ...(diff ? { diff } : {})
      });
    },
    [expenses, saveExpense, saveHashtag, hashtags, merchantMemoryMap, reloadMerchantMemory]
  );

  // Resolve a typed name to an existing (case-insensitive) or freshly created person.
  const getOrCreatePerson = useCallback(
    async (name: string): Promise<Person> => {
      const trimmed = name.trim();
      const existing = persons.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
      if (existing && !existing.isArchived) return existing;
      const now = Date.now();
      const person: Person = existing
        ? { ...existing, isArchived: false, updatedAt: now }
        : { id: crypto.randomUUID(), name: trimmed, createdAt: now, updatedAt: now };
      await personsRepo.put(person);
      logActivity({
        action: existing ? 'UPDATE' : 'CREATE',
        entityType: 'person',
        entityId: person.id,
        summary: `${existing ? 'Updated' : 'Added'} person: ${person.name}`
      });
      return person;
    },
    [persons]
  );

  // Seed / reconcile the IOU ledger entry an expense produces. Called by the form after the
  // expense is saved; pure reconcile logic lives in core/iou/expenseLink.
  const seedIouFromExpense = useCallback(
    async (expenseId: string, intent: ExpenseSeedIntent | null) => {
      const all = await ledgerEntriesRepo.getAll();
      let resolved: ExpenseIouIntent | null = null;
      if (intent && intent.personName.trim() && intent.amount > 0) {
        const person = await getOrCreatePerson(intent.personName);
        resolved = {
          personId: person.id,
          kind: intent.kind,
          amount: intent.amount,
          date: intent.date,
          ...(intent.description ? { description: intent.description } : {})
        };
      }
      const { toPut, toDelete } = reconcileExpenseLink(expenseId, all, resolved, Date.now());
      for (const entry of toPut) {
        await ledgerEntriesRepo.put(entry);
        logActivity({
          action: 'CREATE',
          entityType: 'ledgerEntry',
          entityId: entry.id,
          summary: `${entry.kind} ₹${entry.amount} (from expense)`
        });
      }
      for (const delId of toDelete) await ledgerEntriesRepo.delete(delId);
    },
    [getOrCreatePerson]
  );

  // For the edit form: which transactions have an expense-seeded IOU entry, and with whom.
  const iouLinkByTxn = useMemo(() => {
    const nameById = new Map(persons.map((p) => [p.id, p.name]));
    const map = new Map<string, { personName: string }>();
    for (const e of ledgerEntries) {
      if (e.origin === 'expense' && e.linkedTxnId) {
        map.set(e.linkedTxnId, { personName: nameById.get(e.personId) ?? 'Someone' });
      }
    }
    return map;
  }, [ledgerEntries, persons]);

  // Every transaction that backs an IOU ledger entry (lent/borrowed/settlement, any origin).
  // Analytics treats these as non-routine — lending isn't daily-living consumption.
  const iouLinkedTxnIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of ledgerEntries) if (e.linkedTxnId) ids.add(e.linkedTxnId);
    return ids;
  }, [ledgerEntries]);

  // Seed / reconcile the goal contribution an expense/income/transfer produces — mirrors
  // `seedIouFromExpense` above, just simpler (a goal link only ever names one goal, no "kind").
  // Pure reconcile logic lives in core/goals/goalLink.
  const seedGoalFromExpense = useCallback(async (expenseId: string, intent: ExpenseGoalIntent | null) => {
    const all = await goalContributionsRepo.getAll();
    const { toPut, toDelete } = reconcileGoalLink(expenseId, all, intent, Date.now());
    for (const contribution of toPut) {
      await goalContributionsRepo.put(contribution);
      logActivity({
        action: 'CREATE',
        entityType: 'goalContribution',
        entityId: contribution.id,
        summary: `₹${contribution.amount} toward goal (from transaction)`
      });
    }
    for (const delId of toDelete) await goalContributionsRepo.delete(delId);
    if (toPut.length > 0 || toDelete.length > 0) notifyTxnChanged();
  }, []);

  // For the edit form: which transactions were resolved from a bank-statement import, and what the
  // original statement line(s) looked like (docs/plans/bank-statement-import.md §10a's audit-trail
  // purpose — "matched from bank statement: `<raw narration>`, `<date>`"). Was "a transaction can only
  // ever be linked from one batch's one row, so first-write-wins is fine" until 2026-08-09 — that
  // stopped being true the moment `linkAsCrossAccountTransfer` started absorbing an existing expense as
  // the other leg of a cross-account transfer: the SAME shared `Expense` then legitimately carries TWO
  // `BankStatementImportRecord`s, one from each side's own import (found via on-device testing 2026-08-09
  // — first-write-wins was silently showing only the source account's own narration, never the
  // destination's, even though both statement lines are genuinely resolved). Now collects every record
  // per transaction, not just the first.
  const bankImportLinkByTxn = useMemo(() => {
    const map = new Map<string, { rawNarration: string; date: number }[]>();
    for (const r of bankStatementImportRecords) {
      const existing = map.get(r.linkedTxnId);
      if (existing) existing.push({ rawNarration: r.rawNarration, date: r.date });
      else map.set(r.linkedTxnId, [{ rawNarration: r.rawNarration, date: r.date }]);
    }
    return map;
  }, [bankStatementImportRecords]);

  /** Every transaction whose recorded `paymentMode` disagrees with what its ORIGINAL bank-statement
   *  narration implies (2026-08-06 — same `inferPaymentMode()` used at import time and in
   *  `ExpenseForm`'s own live mismatch note, just re-run here against `bankImportLinkByTxn`'s permanent
   *  audit trail instead of transient import-review state). Purely derived — no schema change, nothing
   *  persisted (same "derived, not stored" principle account balances already follow) — so it's
   *  automatically self-healing the moment the user fixes the payment mode via the edit form, and
   *  automatically covers every past import, not just the one currently being reviewed. Powers both the
   *  Transactions list's per-row warning icon and the "Payment mode mismatch" filter (`TransactionsTab`/
   *  `useTransactionFilters`/`FilterModal`). */
  const paymentModeMismatchTxnIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of expenses) {
      if (!e.paymentMode) continue;
      // First entry only — this account's own leg (see `ExpenseForm.tsx`'s identical convention for a
      // cross-account transfer's two linked lines; a plain expense/income only ever has one anyway).
      const link = bankImportLinkByTxn.get(e.id)?.[0];
      if (!link) continue;
      if (inferPaymentMode(link.rawNarration).id !== e.paymentMode) ids.add(e.id);
    }
    return ids;
  }, [expenses, bankImportLinkByTxn]);

  // For the edit form: which transactions have an expense-seeded goal contribution, and toward which goal.
  const goalLinkByTxn = useMemo(() => {
    const nameById = new Map(goals.map((g) => [g.id, g.name]));
    const map = new Map<string, { goalId: string; goalName: string }>();
    for (const c of goalContributions) {
      if (c.origin === 'expense' && c.linkedTxnId) {
        map.set(c.linkedTxnId, { goalId: c.goalId, goalName: nameById.get(c.goalId) ?? 'a goal' });
      }
    }
    return map;
  }, [goalContributions, goals]);

  // Every transaction that backs a goal contribution — per your call, analytics treats these as
  // non-routine too (money set aside toward a goal isn't daily-living spend), same reasoning as IOU above.
  const goalLinkedTxnIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of goalContributions) if (c.linkedTxnId) ids.add(c.linkedTxnId);
    return ids;
  }, [goalContributions]);

  // Every transaction linked to a given goal (any contribution origin, not just expense-seeded ones) —
  // powers "Filter by goal" in `FilterModal.tsx`/`useTransactionFilters.ts`.
  const txnIdsByGoal = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const c of goalContributions) {
      if (!c.linkedTxnId) continue;
      const set = map.get(c.goalId) ?? new Set<string>();
      set.add(c.linkedTxnId);
      map.set(c.goalId, set);
    }
    return map;
  }, [goalContributions]);

  // Current balance per account — powers the cash-negative guard in the entry form (Track E, E5).
  const accountBalances = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of accounts) map[a.id] = computeBalance(a.id, a.openingBalance, expenses);
    return map;
  }, [accounts, expenses]);

  // ── Recurring auto-post inbox ───────────────────────────────────────────────
  // Recurring series are forecast-only; surface the ones whose next occurrence is
  // due so the user can confirm and log the real transaction.
  const [nowMs] = useState(() => Date.now());
  const [dismissedDue, setDismissedDue] = useState<Set<string>>(new Set());

  useEffect(() => {
    void getJSON<string[]>('penny_recurring_due_dismissed').then((stored) => {
      if (stored) setDismissedDue(new Set(stored));
    });
  }, []);

  const dueRecurring = useMemo(
    () => computeDueRecurring(expenses, nowMs).filter((d) => !dismissedDue.has(`${d.key}:${d.dueMs}`)),
    [expenses, nowMs, dismissedDue]
  );

  /** Log the due occurrence as a real transaction (advances the series). */
  const postRecurring = useCallback(
    (d: DueRecurring) => saveExpenseWithHashtags(buildOccurrence(d.template, d.dueMs)),
    [saveExpenseWithHashtags]
  );

  /** Save a quick-add template (favorite). */
  const saveTemplate = useCallback(
    (t: Omit<TransactionTemplate, 'id' | 'createdAt'>) =>
      saveTemplateRepo({ ...t, id: crypto.randomUUID(), createdAt: Date.now() }),
    [saveTemplateRepo]
  );

  /** Dismiss this due occurrence without logging it. */
  const skipRecurring = useCallback((d: DueRecurring) => {
    setDismissedDue((prev) => {
      const next = new Set(prev).add(`${d.key}:${d.dueMs}`);
      void setJSON('penny_recurring_due_dismissed', [...next]);
      return next;
    });
  }, []);

  return {
    expenses,
    // True only while the initial decrypt-on-load is in flight (`EncryptedRepository.getAll()` decrypts
    // every row up front — see repository.ts) — lets the Transactions list show a real loading state
    // instead of misreporting "No transactions yet" while data is still arriving.
    loading: expensesLoading || categoriesLoading,
    saveExpense,
    removeExpense,
    accounts,
    saveAccount,
    categories,
    hashtags,
    reloadCategories,
    expenseCategories,
    categoryMap,
    parentCategoryMap,
    accountMap,
    spendByCategory,
    txnCountByCategory,
    linkedCountByEventHashtag,
    searchMerchant,
    dueRecurring,
    postRecurring,
    skipRecurring,
    templates,
    saveTemplate,
    removeTemplate,
    saveExpenseWithHashtags,
    deleteExpense,
    persons,
    seedIouFromExpense,
    iouLinkByTxn,
    iouLinkedTxnIds,
    goals,
    seedGoalFromExpense,
    goalLinkByTxn,
    goalLinkedTxnIds,
    bankImportLinkByTxn,
    paymentModeMismatchTxnIds,
    txnIdsByGoal,
    accountBalances,
    patchExpenses,
    removeExpenses,
    saveCategory,
    moveTransactions,
    deleteCategory,
    saveParent,
    deleteParent,
    createParentWithChildren
  };
}
