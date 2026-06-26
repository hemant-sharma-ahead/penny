import { describe, expect, it } from 'vitest';
import { buildAnnualSeries, computeSavingsRate, biggestMovers } from '@/core/expenses/annualAnalytics';
import type { Expense, ExpenseCategory } from '@/core/db/types';

// "now" = 15 Jun 2026 (month index 5).
const NOW = new Date('2026-06-15T10:00:00').getTime();

const tx = (over: Partial<Expense>): Expense => ({
  id: Math.random().toString(36),
  amount: 0,
  categoryId: 'c',
  description: 'x',
  date: NOW,
  hashtags: [],
  isRecurring: false,
  type: 'expense',
  createdAt: 0,
  updatedAt: 0,
  ...over
});

const onDate = (y: number, m: number, d = 10) => new Date(y, m, d, 12).getTime();

describe('buildAnnualSeries', () => {
  it('sums actual income/expense for past+current months and projects future months', () => {
    const expenses = [
      tx({ type: 'expense', amount: 10000, date: onDate(2026, 2) }), // Mar
      tx({ type: 'expense', amount: 20000, date: onDate(2026, 3) }), // Apr
      tx({ type: 'expense', amount: 30000, date: onDate(2026, 4) }), // May
      tx({ type: 'income', amount: 60000, date: onDate(2026, 2) }),
      tx({ type: 'income', amount: 60000, date: onDate(2026, 3) }),
      tx({ type: 'income', amount: 60000, date: onDate(2026, 4) }),
      tx({ type: 'transfer', amount: 99999, date: onDate(2026, 4) }) // ignored
    ];
    const series = buildAnnualSeries(expenses, 2026, NOW);
    expect(series).toHaveLength(12);
    expect(series[2]).toMatchObject({ label: 'Mar', expense: 10000, income: 60000, net: 50000, projected: false });
    // June (current month) is actual (no June data → zeros)
    expect(series[5]).toMatchObject({ label: 'Jun', expense: 0, income: 0, projected: false });
    // July is projected from the trailing 3 full months (Mar/Apr/May): exp avg 20000, inc avg 60000
    expect(series[6]).toMatchObject({ label: 'Jul', expense: 20000, income: 60000, projected: true });
  });

  it('treats every month of a past year as actual (no projection)', () => {
    const series = buildAnnualSeries([], 2025, NOW);
    expect(series.every((p) => !p.projected)).toBe(true);
  });
});

describe('computeSavingsRate', () => {
  it('uses only actual months', () => {
    const series = buildAnnualSeries(
      [
        tx({ type: 'income', amount: 100000, date: onDate(2026, 4) }),
        tx({ type: 'expense', amount: 75000, date: onDate(2026, 4) })
      ],
      2026,
      NOW
    );
    const s = computeSavingsRate(series);
    expect(s.income).toBe(100000);
    expect(s.expense).toBe(75000);
    expect(s.saved).toBe(25000);
    expect(s.rate).toBeCloseTo(0.25, 5);
  });
});

describe('biggestMovers', () => {
  const cats = new Map<string, ExpenseCategory>([
    ['dining', { id: 'dining', name: 'Dining', icon: 'ti-coffee', color: '#f59e0b', isDefault: true, createdAt: 0 }]
  ]);

  it('compares last completed month vs the prior 3-month average', () => {
    // last completed month before 15 Jun = May (idx 4). Prior 3 = Feb/Mar/Apr.
    const expenses = [
      tx({ categoryId: 'dining', amount: 2000, date: onDate(2026, 1) }), // Feb
      tx({ categoryId: 'dining', amount: 2000, date: onDate(2026, 2) }), // Mar
      tx({ categoryId: 'dining', amount: 2000, date: onDate(2026, 3) }), // Apr  → avg 2000
      tx({ categoryId: 'dining', amount: 3000, date: onDate(2026, 4) }) // May → +50%
    ];
    const movers = biggestMovers(expenses, cats, NOW);
    expect(movers).toHaveLength(1);
    expect(movers[0]).toMatchObject({ categoryId: 'dining', current: 3000, average: 2000 });
    expect(movers[0]?.pct).toBeCloseTo(0.5, 5);
  });
});
