import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  accountsRepo,
  budgetsRepo,
  expenseCategoriesRepo,
  expensesRepo,
  hashtagsRepo,
  ledgerEntriesRepo,
  merchantMemoryRepo,
  personsRepo,
  transactionTemplatesRepo
} from '@/core/db/repositories';
import type {
  Expense,
  ExpenseCategory,
  MerchantMemory,
  Person,
  TransactionTemplate,
  TransactionType
} from '@/core/db/types';
import { reconcileExpenseLink, type ExpenseIouIntent, type ExpenseSeedIntent } from '@/core/iou/expenseLink';
import { useRepository } from '@/hooks/useRepository';
import { useTxnRefresh, notifyTxnChanged } from '@/hooks/useTxnRefresh';
import { ALL_DEFAULT_CATEGORIES, CATEGORY_MIGRATION_MAP } from '@/core/db/defaultCategories';
import { calcSpendByCategory, calcTxnCountByCategory } from '@/core/expenses/filterAndAggregate';
import { buildParentCategoryMap } from '@/core/expenses/categoryGroups';
import {
  buildMemoriesFromExpenses,
  buildMemory,
  memoryKey,
  searchMerchantMemories
} from '@/core/expenses/merchantMemory';
import { computeDueRecurring, buildOccurrence, type DueRecurring } from '@/core/expenses/recurringDue';
import { normalizeHashtag } from '@/context/EventModeContext';
import { logActivity, restoreActivity, summarizeDiff } from '@/core/db/activityLog';
import { useToast } from '@/context/ToastContext';

const expenseSummary = (verb: string, e: Expense) => `${verb} ${e.type}: ${e.description} ₹${e.amount}`;

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
  const { items: hashtags, save: saveHashtag } = useRepository(hashtagsRepo);
  const { items: accounts } = useRepository(accountsRepo);
  const { items: persons, reload: reloadPersons } = useRepository<Person>(personsRepo);
  const { items: ledgerEntries, reload: reloadLedger } = useRepository(ledgerEntriesRepo);

  // The IOU screen writes expenses/ledger entries through separate repo instances; reload on its signal.
  const refreshTxnData = useCallback(() => {
    reloadExpenses();
    reloadLedger();
    reloadPersons();
  }, [reloadExpenses, reloadLedger, reloadPersons]);
  useTxnRefresh(refreshTxnData);
  const { items: merchantMemories, reload: reloadMerchantMemory } = useRepository(merchantMemoryRepo);
  const { items: templates, save: saveTemplateRepo, remove: removeTemplate } = useRepository(transactionTemplatesRepo);

  // Category v2 migration: seeds default categories and patches any that lack intentGroup
  const seededRef = useRef(false);
  useEffect(() => {
    if (categoriesLoading) return;
    if (seededRef.current) return;
    const needsMigration =
      !localStorage.getItem('penny_cats_v2') || categories.some((c) => c.isDefault && !c.intentGroup);
    if (!needsMigration) {
      seededRef.current = true;
      return;
    }
    seededRef.current = true;
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
    Promise.all([...toSeed, ...toPatch].map((c) => expenseCategoriesRepo.put(c)))
      .then(() => {
        localStorage.setItem('penny_cats_v2', '1');
        reloadCategories();
      })
      .catch(() => {});
  }, [categoriesLoading, categories, reloadCategories]);

  // Additive default-category seeding (v3): inserts any default categories the user is missing
  // (e.g. the Sin Goods categories added in Track 7) WITHOUT re-putting existing ones, so user
  // edits to default categories are never clobbered. Re-runs once per version bump.
  const catSeedRef = useRef(false);
  useEffect(() => {
    if (categoriesLoading || catSeedRef.current) return;
    if (localStorage.getItem('penny_cats_v3')) {
      catSeedRef.current = true;
      return;
    }
    catSeedRef.current = true;
    const existingIds = new Set(categories.map((c) => c.id));
    const missing = ALL_DEFAULT_CATEGORIES.filter((c) => !existingIds.has(c.id));
    Promise.all(missing.map((c) => expenseCategoriesRepo.put({ ...c, createdAt: Date.now() })))
      .then(() => {
        localStorage.setItem('penny_cats_v3', '1');
        if (missing.length > 0) reloadCategories();
      })
      .catch(() => {});
  }, [categoriesLoading, categories, reloadCategories]);

  // One-time merchant-memory backfill from existing transactions, so suggestions
  // work immediately on upgrade. v2 re-keys records by merchant + category, so on
  // migration we clear any v1 records and rebuild.
  const backfilledRef = useRef(false);
  useEffect(() => {
    if (backfilledRef.current || expensesLoading) return;
    backfilledRef.current = true;
    if (localStorage.getItem('penny_merchant_memory_v2')) return;
    (async () => {
      const existing = await merchantMemoryRepo.getAll();
      await Promise.all(existing.map((m) => merchantMemoryRepo.delete(m.id)));
      const memories = buildMemoriesFromExpenses(expenses);
      await Promise.all(memories.map((m) => merchantMemoryRepo.put(m)));
      localStorage.setItem('penny_merchant_memory_v2', '1');
      localStorage.removeItem('penny_merchant_memory_v1');
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
      await Promise.all(expenseIds.map((id) => expensesRepo.delete(id)));
      reloadExpenses();
      const first = removed[0];
      if (!first) return;
      const label = `${removed.length} transaction${removed.length === 1 ? '' : 's'}`;
      const logId = logActivity({
        action: 'BULK_DELETE',
        entityType: 'expense',
        entityId: first.id,
        summary: `Deleted ${label}`,
        snapshot: JSON.stringify(removed),
        entityCount: removed.length
      });
      showToast({
        message: `Deleted ${label}`,
        actionLabel: 'Undo',
        onAction: async () => {
          await restoreActivity(logId);
          reloadExpenses();
        }
      });
    },
    [expenses, reloadExpenses, showToast]
  );

  /** Delete a single transaction, with Undo. Cascade-deletes linked IOU entries and restores both atomically. */
  const deleteExpense = useCallback(
    async (id: string) => {
      const exp = expenses.find((e) => e.id === id);
      await removeExpense(id);
      // Cascade-delete any IOU ledger entries linked to this transaction.
      const linkedEntries = (await ledgerEntriesRepo.getAll()).filter((le) => le.linkedTxnId === id);
      for (const le of linkedEntries) await ledgerEntriesRepo.delete(le.id);
      if (linkedEntries.length > 0) {
        reloadLedger();
        notifyTxnChanged();
      }
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
          if (linkedEntries.length > 0) {
            reloadLedger();
            notifyTxnChanged();
          }
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

  // Compound mutation: saves the expense and upserts all hashtag usage counts atomically
  const saveExpenseWithHashtags = useCallback(
    async (expense: Expense) => {
      const existing = expenses.find((e) => e.id === expense.id);
      await saveExpense(expense);
      for (const tag of expense.hashtags) {
        const existingTag = hashtags.find((h) => h.name === tag);
        if (existingTag) {
          await saveHashtag({ ...existingTag, usageCount: existingTag.usageCount + 1 });
        } else {
          await saveHashtag({ id: crypto.randomUUID(), name: tag, usageCount: 1, createdAt: Date.now() });
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

  // ── Recurring auto-post inbox ───────────────────────────────────────────────
  // Recurring series are forecast-only; surface the ones whose next occurrence is
  // due so the user can confirm and log the real transaction.
  const [nowMs] = useState(() => Date.now());
  const [dismissedDue, setDismissedDue] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('penny_recurring_due_dismissed') ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });

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
      localStorage.setItem('penny_recurring_due_dismissed', JSON.stringify([...next]));
      return next;
    });
  }, []);

  return {
    expenses,
    saveExpense,
    removeExpense,
    accounts,
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
