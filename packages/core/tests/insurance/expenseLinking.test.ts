import { describe, expect, it } from 'vitest';
import { buildPremiumExpense, findCandidateExpenses } from '@/core/insurance/expenseLinking';
import type { Expense } from '@/core/db/types';

const DAY = 86_400_000;

const makeExpense = (over: Partial<Expense> = {}): Expense => ({
  id: 'e1',
  amount: 900,
  categoryId: 'cat-x',
  description: 'desc',
  date: 0,
  hashtags: [],
  isRecurring: false,
  type: 'expense',
  createdAt: 0,
  updatedAt: 0,
  ...over
});

describe('buildPremiumExpense', () => {
  it('builds an expense with the plan-name premium description and given category/amount/date', () => {
    const e = buildPremiumExpense('iSelect Smart360 Term Plan', 900, 12345, 'cat-insurance-premium');
    expect(e.description).toBe('iSelect Smart360 Term Plan premium');
    expect(e.amount).toBe(900);
    expect(e.categoryId).toBe('cat-insurance-premium');
    expect(e.date).toBe(12345);
    expect(e.type).toBe('expense');
    expect(e.source).toBe('manual');
  });
});

describe('findCandidateExpenses', () => {
  const dueMs = 100 * DAY;

  it('ranks by date proximity then amount proximity, excludes transfers and excluded ids', () => {
    const expenses = [
      makeExpense({ id: 'far', amount: 900, date: dueMs - 8 * DAY }),
      makeExpense({ id: 'close-exact', amount: 900, date: dueMs - 1 * DAY }),
      makeExpense({ id: 'close-off-amount', amount: 880, date: dueMs - 1 * DAY }),
      makeExpense({ id: 'transfer', amount: 900, date: dueMs, type: 'transfer' }),
      makeExpense({ id: 'excluded', amount: 900, date: dueMs, type: 'expense' })
    ];
    const result = findCandidateExpenses(expenses, dueMs, 900, new Set(['excluded']), 3, 10);
    expect(result.map((e) => e.id)).toEqual(['close-exact', 'close-off-amount', 'far']);
  });

  it('excludes anything outside the date window', () => {
    const expenses = [makeExpense({ id: 'too-far', amount: 900, date: dueMs - 30 * DAY })];
    expect(findCandidateExpenses(expenses, dueMs, 900, new Set(), 3, 10)).toEqual([]);
  });

  it('respects the limit', () => {
    const expenses = Array.from({ length: 5 }, (_, i) => makeExpense({ id: `e${i}`, amount: 900, date: dueMs }));
    expect(findCandidateExpenses(expenses, dueMs, 900, new Set(), 2, 10)).toHaveLength(2);
  });
});
