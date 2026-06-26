import { describe, expect, it } from 'vitest';
import {
  normalizeMerchant,
  memoryKey,
  buildMemory,
  buildMemoriesFromExpenses,
  searchMerchantMemories
} from '@/core/expenses/merchantMemory';
import type { Expense, MerchantMemory } from '@/core/db/types';

const makeExpense = (over: Partial<Expense> = {}): Expense => ({
  id: 'e1',
  amount: 250,
  categoryId: 'cat-food',
  description: 'Swiggy',
  date: 0,
  hashtags: [],
  isRecurring: false,
  type: 'expense',
  accountId: 'acc-hdfc',
  paymentMode: 'upi',
  createdAt: 0,
  updatedAt: 0,
  ...over
});

describe('normalizeMerchant', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeMerchant('  Swiggy   Order ')).toBe('swiggy order');
  });

  it('strips surrounding punctuation but keeps inner characters', () => {
    expect(normalizeMerchant('*Amazon.in*')).toBe('amazon.in');
    expect(normalizeMerchant('!!Zomato!!')).toBe('zomato');
  });

  it('returns empty string for blank input', () => {
    expect(normalizeMerchant('   ')).toBe('');
  });
});

describe('memoryKey', () => {
  it('namespaces by transaction type AND category', () => {
    expect(memoryKey('expense', 'Swiggy', 'cat-food')).toBe('expense::swiggy::cat-food');
    expect(memoryKey('income', 'Swiggy', 'cat-food')).toBe('income::swiggy::cat-food');
    expect(memoryKey('expense', 'Swiggy', 'cat-other')).toBe('expense::swiggy::cat-other');
  });

  it('is empty when the description or category is blank', () => {
    expect(memoryKey('expense', '  ', 'cat-food')).toBe('');
    expect(memoryKey('expense', 'Swiggy', '')).toBe('');
  });
});

describe('buildMemory', () => {
  it('captures category/account/payment and increments usage for the same mapping', () => {
    const prev: MerchantMemory = {
      id: 'expense::swiggy::cat-food',
      description: 'Swiggy',
      type: 'expense',
      categoryId: 'cat-food',
      usageCount: 2,
      updatedAt: 0
    };
    const mem = buildMemory(makeExpense(), prev);
    expect(mem).toMatchObject({
      id: 'expense::swiggy::cat-food',
      categoryId: 'cat-food',
      accountId: 'acc-hdfc',
      paymentMode: 'upi',
      type: 'expense',
      usageCount: 3
    });
  });

  it('starts usage at 1 with no previous record', () => {
    expect(buildMemory(makeExpense())?.usageCount).toBe(1);
  });

  it('returns null for transfers, blank descriptions, or missing category', () => {
    expect(buildMemory(makeExpense({ type: 'transfer' }))).toBeNull();
    expect(buildMemory(makeExpense({ description: '   ' }))).toBeNull();
    expect(buildMemory(makeExpense({ categoryId: '' }))).toBeNull();
  });
});

describe('buildMemoriesFromExpenses', () => {
  it('keeps one record per merchant+category (so a merchant used two ways yields both)', () => {
    const memories = buildMemoriesFromExpenses([
      makeExpense({ id: 'a', description: 'Dine out', date: 100, categoryId: 'cat-dining', paymentMode: 'cash' }),
      makeExpense({ id: 'b', description: 'Dine out', date: 300, categoryId: 'cat-dining', paymentMode: 'upi' }),
      makeExpense({ id: 'c', description: 'Dine out', date: 200, categoryId: 'cat-other' }),
      makeExpense({ id: 'd', type: 'transfer', description: 'To savings', date: 400 }), // ignored
      makeExpense({ id: 'e', description: 'Mystery', date: 500, categoryId: '' }) // ignored
    ]);

    expect(memories).toHaveLength(2); // Dining (×2) and Other (×1) — both kept
    const dining = memories.find((m) => m.id === 'expense::dine out::cat-dining');
    expect(dining).toMatchObject({ usageCount: 2, paymentMode: 'upi' }); // latest within the mapping wins
    expect(memories.find((m) => m.id === 'expense::dine out::cat-other')).toMatchObject({ usageCount: 1 });
  });
});

describe('searchMerchantMemories', () => {
  const memories: MerchantMemory[] = [
    { id: 'expense::dine out::cat-dining', description: 'Dine out', type: 'expense', categoryId: 'cat-dining', usageCount: 12, updatedAt: 2 },
    { id: 'expense::dine out::cat-other', description: 'Dine out', type: 'expense', categoryId: 'cat-other', usageCount: 2, updatedAt: 1 },
    { id: 'expense::swiggy::cat-food', description: 'Swiggy', type: 'expense', categoryId: 'cat-food', usageCount: 5, updatedAt: 3 },
    { id: 'income::salary::cat-inc', description: 'Salary', type: 'income', categoryId: 'cat-inc', usageCount: 9, updatedAt: 4 }
  ];

  it('substring-matches and ranks by usage, returning both mappings of a merchant', () => {
    const got = searchMerchantMemories(memories, 'expense', 'din');
    expect(got.map((m) => m.categoryId)).toEqual(['cat-dining', 'cat-other']); // both, usage-ranked
  });

  it('filters by transaction type and ignores blank queries', () => {
    expect(searchMerchantMemories(memories, 'income', 'sal').map((m) => m.id)).toEqual(['income::salary::cat-inc']);
    expect(searchMerchantMemories(memories, 'expense', '  ')).toEqual([]);
  });
});
