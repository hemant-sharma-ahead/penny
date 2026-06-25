import { useCallback, useEffect, useMemo, useRef } from 'react';
import { accountsRepo, budgetsRepo, expenseCategoriesRepo, expensesRepo, hashtagsRepo } from '@/core/db/repositories';
import type { Expense, ExpenseCategory } from '@/core/db/types';
import { useRepository } from '@/hooks/useRepository';
import { ALL_DEFAULT_CATEGORIES, CATEGORY_MIGRATION_MAP } from '@/core/db/defaultCategories';
import { calcSpendByCategory, calcTxnCountByCategory } from '@/core/expenses/filterAndAggregate';
import { buildParentCategoryMap } from '@/core/expenses/categoryGroups';
import { normalizeHashtag } from '@/context/EventModeContext';
import { logActivity, restoreActivity, summarizeDiff } from '@/core/db/activityLog';
import { useToast } from '@/context/ToastContext';

const expenseSummary = (verb: string, e: Expense) => `${verb} ${e.type}: ${e.description} ₹${e.amount}`;

export function useExpenses() {
  const { showToast } = useToast();
  const {
    items: expenses,
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

  const expenseCategories = useMemo(
    () => categories.filter((c) => !c.isGroup && (!c.applicableTo || c.applicableTo === 'expense')),
    [categories]
  );

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const parentCategoryMap = useMemo(() => buildParentCategoryMap(categories), [categories]);
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
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

  /** Delete a single transaction, with Undo. */
  const deleteExpense = useCallback(
    async (id: string) => {
      const exp = expenses.find((e) => e.id === id);
      await removeExpense(id);
      if (!exp) return;
      const logId = logActivity({
        action: 'DELETE',
        entityType: 'expense',
        entityId: id,
        summary: expenseSummary('Deleted', exp),
        snapshot: JSON.stringify(exp)
      });
      showToast({
        message: `Deleted ${exp.description}`,
        actionLabel: 'Undo',
        onAction: async () => {
          await restoreActivity(logId);
          reloadExpenses();
        }
      });
    },
    [expenses, removeExpense, reloadExpenses, showToast]
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
    [expenses, saveExpense, saveHashtag, hashtags]
  );

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
    saveExpenseWithHashtags,
    deleteExpense,
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
