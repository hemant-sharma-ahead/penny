import { useCallback, useEffect, useMemo, useRef } from 'react';
import { accountsRepo, budgetsRepo, expenseCategoriesRepo, expensesRepo, hashtagsRepo } from '@/core/db/repositories';
import type { Expense, ExpenseCategory } from '@/core/db/types';
import { useRepository } from '@/hooks/useRepository';
import { ALL_DEFAULT_CATEGORIES, CATEGORY_MIGRATION_MAP } from '@/core/db/defaultCategories';
import { calcSpendByCategory, calcTxnCountByCategory } from '@/core/expenses/filterAndAggregate';
import { buildParentCategoryMap } from '@/core/expenses/categoryGroups';
import { normalizeHashtag } from '@/context/EventModeContext';

export function useExpenses() {
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
      await expenseCategoriesRepo.put(cat);
      reloadCategories();
    },
    [reloadCategories]
  );

  /** Reassign every transaction in `sourceIds` to `targetId`. Sources are not deleted. */
  const moveTransactions = useCallback(
    async (sourceIds: string[], targetId: string) => {
      const sources = new Set(sourceIds);
      const now = Date.now();
      const affected = expenses.filter((e) => sources.has(e.categoryId));
      await Promise.all(affected.map((e) => expensesRepo.put({ ...e, categoryId: targetId, updatedAt: now })));
      reloadExpenses();
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
    },
    [expenses, reloadExpenses]
  );

  /** Delete specific transactions (by id) in one batch. */
  const removeExpenses = useCallback(
    async (expenseIds: string[]) => {
      await Promise.all(expenseIds.map((id) => expensesRepo.delete(id)));
      reloadExpenses();
    },
    [reloadExpenses]
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
    },
    [categories, txnCountByCategory, reloadCategories]
  );

  const saveParent = useCallback(
    async (parent: ExpenseCategory) => {
      await expenseCategoriesRepo.put({ ...parent, isGroup: true });
      reloadCategories();
    },
    [reloadCategories]
  );

  /** Delete a parent that has no children. No-op otherwise. */
  const deleteParent = useCallback(
    async (id: string) => {
      if (categories.some((c) => c.parentId === id)) return;
      await expenseCategoriesRepo.delete(id);
      reloadCategories();
    },
    [categories, reloadCategories]
  );

  /** Create a parent group plus its mandatory ≥1 child categories in one go. */
  const createParentWithChildren = useCallback(
    async (parent: ExpenseCategory, children: ExpenseCategory[]) => {
      if (children.length === 0) return;
      await expenseCategoriesRepo.put({ ...parent, isGroup: true });
      await Promise.all(children.map((c) => expenseCategoriesRepo.put({ ...c, parentId: parent.id })));
      reloadCategories();
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
      await saveExpense(expense);
      for (const tag of expense.hashtags) {
        const existing = hashtags.find((h) => h.name === tag);
        if (existing) {
          await saveHashtag({ ...existing, usageCount: existing.usageCount + 1 });
        } else {
          await saveHashtag({ id: crypto.randomUUID(), name: tag, usageCount: 1, createdAt: Date.now() });
        }
      }
    },
    [saveExpense, saveHashtag, hashtags]
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
