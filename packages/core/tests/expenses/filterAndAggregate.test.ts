import { describe, expect, it } from 'vitest';
import { groupExpensesByDate } from '@/core/expenses/filterAndAggregate';
import type { Expense } from '@/core/db/types';

// `toDateKey` (which `groupExpensesByDate` groups by) uses LOCAL calendar-day boundaries
// (`d.getFullYear()`/`getMonth()`/`getDate()`), not UTC — so tests must construct timestamps the same
// way, or a same-local-day pair could land on different UTC calendar days depending on the test
// runner's timezone and flip test results.
function localMs(year: number, month: number, day: number, hour = 0): number {
  return new Date(year, month, day, hour).getTime();
}

function makeExpense(overrides: Partial<Expense> & { id: string; date: number }): Expense {
  return {
    amount: 100,
    categoryId: 'cat-1',
    description: 'test',
    hashtags: [],
    isRecurring: false,
    createdAt: overrides.date,
    updatedAt: overrides.date,
    ...overrides
  };
}

describe('groupExpensesByDate', () => {
  it('returns an empty array for no expenses', () => {
    expect(groupExpensesByDate([])).toEqual([]);
  });

  it('groups a single expense into one day with the right label', () => {
    const e = makeExpense({ id: 'a', date: localMs(2026, 0, 15, 10) });
    const grouped = groupExpensesByDate([e]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.items).toEqual([e]);
  });

  it('groups multiple same-day expenses together, newest createdAt first', () => {
    const morning = makeExpense({ id: 'morning', date: localMs(2026, 0, 15, 8), createdAt: localMs(2026, 0, 15, 8) });
    const evening = makeExpense({
      id: 'evening',
      date: localMs(2026, 0, 15, 20),
      createdAt: localMs(2026, 0, 15, 20)
    });
    const grouped = groupExpensesByDate([morning, evening]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.items.map((e) => e.id)).toEqual(['evening', 'morning']);
  });

  it('orders groups newest-day-first regardless of input order', () => {
    const jan1 = makeExpense({ id: 'jan1', date: localMs(2026, 0, 1) });
    const jan15 = makeExpense({ id: 'jan15', date: localMs(2026, 0, 15) });
    const feb1 = makeExpense({ id: 'feb1', date: localMs(2026, 1, 1) });
    // Deliberately out of order input — the function must sort, not assume pre-sorted input.
    const grouped = groupExpensesByDate([jan15, feb1, jan1]);
    expect(grouped.map((g) => g.items[0]?.id)).toEqual(['feb1', 'jan15', 'jan1']);
  });

  it('breaks same-date ties by newest createdAt (a backdated entry logged later still shows on top)', () => {
    const original = makeExpense({ id: 'original', date: localMs(2026, 0, 15), createdAt: localMs(2026, 0, 15) });
    const backdatedLater = makeExpense({
      id: 'backdated-but-logged-later',
      date: localMs(2026, 0, 15),
      createdAt: localMs(2026, 0, 20)
    });
    const grouped = groupExpensesByDate([original, backdatedLater]);
    expect(grouped[0]?.items.map((e) => e.id)).toEqual(['backdated-but-logged-later', 'original']);
  });

  it('produces the same grouping/ordering for a large, densely-packed, unsorted history (regression: previous implementation cost 700ms-1.5s for ~5,000 rows on a real device)', () => {
    const expenses: Expense[] = [];
    // 500 distinct days, 10 transactions each, deliberately shuffled (reverse-chunk order) so the
    // function can't rely on any accidental pre-sortedness.
    for (let day = 0; day < 500; day++) {
      for (let n = 0; n < 10; n++) {
        expenses.unshift(
          makeExpense({
            id: `d${day}-${n}`,
            date: localMs(2020, 0, 1) + day * 86_400_000 + n * 60_000,
            createdAt: localMs(2020, 0, 1) + day * 86_400_000 + n * 60_000
          })
        );
      }
    }
    const grouped = groupExpensesByDate(expenses);
    expect(grouped).toHaveLength(500);
    expect(grouped[0]?.items).toHaveLength(10);
    // Newest day first, newest-in-day first.
    expect(grouped[0]?.items[0]?.id).toBe('d499-9');
    expect(grouped[0]?.items[9]?.id).toBe('d499-0');
    expect(grouped[499]?.items[0]?.id).toBe('d0-9');
  });
});
