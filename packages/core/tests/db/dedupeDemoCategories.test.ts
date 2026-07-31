import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/schema';
import { deriveKey, generateSalt } from '@/core/crypto/engine';
import { keystore } from '@/core/crypto/keystore';
import {
  budgetsRepo,
  expenseCategoriesRepo,
  expensesRepo
} from '@/core/db/repositories';
import {
  dedupeDemoCategories,
  LEGACY_DEMO_CAT_ALIAS,
  reconcileDefaultCategories,
  repairCategoryIcons
} from '@/core/db/dedupeDemoCategories';
import type { Budget, Expense, ExpenseCategory } from '@/core/db/types';

async function setupKeystore() {
  const salt = generateSalt();
  keystore.setMasterKey(await deriveKey('test-passphrase', salt, 1_000));
}

function cat(id: string, name: string): ExpenseCategory {
  return { id, name, icon: 'ti-dots', color: '#000', isDefault: true, intentGroup: 'daily_living', applicableTo: 'expense', createdAt: 0 };
}
function expense(id: string, categoryId: string): Expense {
  return { id, amount: 100, categoryId, description: 'x', date: 1, hashtags: [], isRecurring: false, createdAt: 1, updatedAt: 1 };
}
function budget(id: string, categoryId: string): Budget {
  return { id, categoryId, monthYear: '2026-07', limitAmount: 1000, createdAt: 1, updatedAt: 1 } as Budget;
}

describe('dedupeDemoCategories', () => {
  beforeEach(async () => {
    await setupKeystore();
    await Promise.all([db.expenses.clear(), db.budgets.clear(), db.expense_categories.clear()]);
  });

  it('remaps legacy demo-cat references to the canonical default and deletes the demo categories', async () => {
    await expenseCategoriesRepo.put(cat('cat-groceries', 'Groceries'));
    await expenseCategoriesRepo.put(cat('demo-cat-groceries', 'Groceries')); // the duplicate
    await expenseCategoriesRepo.put(cat('demo-cat-rent', 'Rent'));
    await expensesRepo.put(expense('e1', 'demo-cat-groceries'));
    await expensesRepo.put(expense('e2', 'cat-food')); // untouched
    await budgetsRepo.put(budget('b1', 'demo-cat-rent'));

    const { remapped, removed } = await dedupeDemoCategories();

    expect(remapped).toBe(1); // e1
    expect(removed).toBe(2); // demo-cat-groceries + demo-cat-rent
    expect((await expensesRepo.get('e1'))?.categoryId).toBe('cat-groceries');
    expect((await expensesRepo.get('e2'))?.categoryId).toBe('cat-food');
    expect((await budgetsRepo.get('b1'))?.categoryId).toBe('cat-rent');
    expect(await expenseCategoriesRepo.get('demo-cat-groceries')).toBeUndefined();
    expect(await expenseCategoriesRepo.get('demo-cat-rent')).toBeUndefined();
    // The canonical default survives.
    expect(await expenseCategoriesRepo.get('cat-groceries')).toBeDefined();
  });

  it('is a no-op (idempotent) when there are no legacy demo categories', async () => {
    await expenseCategoriesRepo.put(cat('cat-groceries', 'Groceries'));
    await expensesRepo.put(expense('e1', 'cat-groceries'));
    const { remapped, removed } = await dedupeDemoCategories();
    expect(remapped).toBe(0);
    expect(removed).toBe(0);
    expect((await expensesRepo.get('e1'))?.categoryId).toBe('cat-groceries');
  });

  it('covers all ten legacy demo categories in the alias map', () => {
    expect(Object.keys(LEGACY_DEMO_CAT_ALIAS)).toHaveLength(10);
    expect(LEGACY_DEMO_CAT_ALIAS['demo-cat-dining']).toBe('cat-food');
    expect(LEGACY_DEMO_CAT_ALIAS['demo-cat-investments']).toBe('cat-sip');
  });
});

describe('repairCategoryIcons', () => {
  beforeEach(async () => {
    await setupKeystore();
    await db.expense_categories.clear();
  });

  it('replaces webfont-missing icons on existing records with valid equivalents', async () => {
    await expenseCategoriesRepo.put({ ...cat('cat-savings', 'Savings Transfer'), icon: 'ti-piggy-bank' });
    await expenseCategoriesRepo.put({ ...cat('cat-trip-food', 'Food on Trip'), icon: 'ti-fork' });
    await expenseCategoriesRepo.put({ ...cat('cat-groceries', 'Groceries'), icon: 'ti-basket' }); // untouched

    const fixed = await repairCategoryIcons();

    expect(fixed).toBe(2);
    expect((await expenseCategoriesRepo.get('cat-savings'))?.icon).toBe('ti-pig-money');
    expect((await expenseCategoriesRepo.get('cat-trip-food'))?.icon).toBe('ti-tools-kitchen-2');
    expect((await expenseCategoriesRepo.get('cat-groceries'))?.icon).toBe('ti-basket');
  });
});

describe('reconcileDefaultCategories', () => {
  beforeEach(async () => {
    await setupKeystore();
    await db.expense_categories.clear();
  });

  it('renames Dividends & Interest and moves Fuel to Daily Living when stored values still match', async () => {
    await expenseCategoriesRepo.put({ ...cat('cat-inc-dividends', 'Dividends & Interest'), applicableTo: 'income', intentGroup: 'income' });
    await expenseCategoriesRepo.put({ ...cat('cat-fuel', 'Fuel'), intentGroup: 'travel' });

    const updated = await reconcileDefaultCategories();

    expect(updated).toBe(2);
    expect((await expenseCategoriesRepo.get('cat-inc-dividends'))?.name).toBe('Dividends');
    expect((await expenseCategoriesRepo.get('cat-fuel'))?.intentGroup).toBe('daily_living');
  });

  it('does not clobber a user-customised default (from no longer matches)', async () => {
    await expenseCategoriesRepo.put({ ...cat('cat-fuel', 'Petrol'), intentGroup: 'daily_living' });
    const updated = await reconcileDefaultCategories();
    expect(updated).toBe(0);
    expect((await expenseCategoriesRepo.get('cat-fuel'))?.name).toBe('Petrol');
  });
});
