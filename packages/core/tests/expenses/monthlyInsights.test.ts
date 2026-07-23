import { describe, expect, it } from 'vitest';
import { monthlyRecap, computeAnomalies } from '@/core/expenses/monthlyInsights';
import type { Expense, ExpenseCategory } from '@/core/db/types';

const NOW = new Date('2026-06-26T10:00:00').getTime();
const at = (y: number, m: number, d = 10) => new Date(y, m, d, 12).getTime();
const never = () => false;

const cats = new Map<string, ExpenseCategory>([
  ['dining', { id: 'dining', name: 'Dining', icon: 'ti-coffee', color: '#f59e0b', isDefault: true, createdAt: 0 }],
  ['rent', { id: 'rent', name: 'Rent', icon: 'ti-home', color: '#ec4899', isDefault: true, createdAt: 0 }]
]);

const tx = (over: Partial<Expense>): Expense => ({
  id: Math.random().toString(36),
  amount: 0,
  categoryId: 'dining',
  description: 'x',
  date: NOW,
  hashtags: [],
  isRecurring: false,
  type: 'expense',
  createdAt: 0,
  updatedAt: 0,
  ...over
});

describe('monthlyRecap', () => {
  it('summarises spend, income, net, vs-last-month, top category & expense', () => {
    const expenses = [
      tx({ amount: 20000, categoryId: 'rent', description: 'Rent', date: at(2026, 5, 3) }), // Jun
      tx({ amount: 3000, categoryId: 'dining', description: 'Dinner', date: at(2026, 5, 12) }),
      tx({ amount: 120000, type: 'income', description: 'Salary', date: at(2026, 5, 1) }),
      tx({ amount: 18000, categoryId: 'rent', description: 'Rent', date: at(2026, 4, 3) }), // May (prev)
      tx({ amount: 5000, type: 'transfer', description: 'move', date: at(2026, 5, 5) }) // ignored
    ];
    const r = monthlyRecap(expenses, cats, '2026-06', never);
    expect(r).toMatchObject({ expense: 23000, income: 120000, net: 97000, prevExpense: 18000 });
    expect(r.txnCount).toBe(3); // 2 expenses + 1 income; transfer excluded
    expect(r.deltaPct).toBeCloseTo((23000 - 18000) / 18000, 5);
    expect(r.topCategory).toMatchObject({ name: 'Rent', amount: 20000 });
    expect(r.topExpense).toMatchObject({ description: 'Rent', amount: 20000 });
  });
});

describe('computeAnomalies', () => {
  it('flags a category well above its pro-rated trailing average', () => {
    // Dining averaged 2000/mo over Mar–May; in June (26/30 elapsed) already 4000.
    const expenses = [
      tx({ amount: 2000, date: at(2026, 2, 10) }),
      tx({ amount: 2000, date: at(2026, 3, 10) }),
      tx({ amount: 2000, date: at(2026, 4, 10) }),
      tx({ amount: 4000, date: at(2026, 5, 10) })
    ];
    const anomalies = computeAnomalies(expenses, cats, '2026-06', never, NOW);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]?.categoryId).toBe('dining');
    // baseline = 2000 * 26/30 ≈ 1733; 4000 is well over
    expect(anomalies[0]!.pct).toBeGreaterThan(1);
  });

  it('ignores categories within normal range', () => {
    const expenses = [
      tx({ amount: 2000, date: at(2026, 2, 10) }),
      tx({ amount: 2000, date: at(2026, 3, 10) }),
      tx({ amount: 2000, date: at(2026, 4, 10) }),
      tx({ amount: 1500, date: at(2026, 5, 10) })
    ];
    expect(computeAnomalies(expenses, cats, '2026-06', never, NOW)).toHaveLength(0);
  });
});
