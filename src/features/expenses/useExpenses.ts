import { useCallback, useEffect, useMemo, useRef } from 'react';
import { accountsRepo, expenseCategoriesRepo, expensesRepo, hashtagsRepo } from '@/core/db/repositories';
import type { Expense } from '@/core/db/types';
import { useRepository } from '@/hooks/useRepository';
import { ALL_DEFAULT_CATEGORIES, CATEGORY_MIGRATION_MAP } from '@/core/db/defaultCategories';
import { calcSpendByCategory } from '@/core/expenses/filterAndAggregate';
import { normalizeHashtag } from '@/context/EventModeContext';

export function useExpenses() {
  const { items: expenses, save: saveExpense, remove: removeExpense } = useRepository(expensesRepo);
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
    () => categories.filter((c) => !c.applicableTo || c.applicableTo === 'expense'),
    [categories]
  );

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const spendByCategory = useMemo(() => calcSpendByCategory(expenses), [expenses]);

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
    expenseCategories,
    categoryMap,
    accountMap,
    spendByCategory,
    linkedCountByEventHashtag,
    saveExpenseWithHashtags
  };
}
