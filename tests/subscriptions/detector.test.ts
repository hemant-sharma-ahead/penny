import { describe, expect, it } from 'vitest';
import { detectSubscriptions } from '@/core/subscriptions/detector';
import type { Expense } from '@/core/db/types';

const DAY = 86_400_000;
const NOW = new Date('2026-06-26T10:00:00').getTime();

const charge = (amount: number, daysAgo: number): Expense => ({
  id: Math.random().toString(36),
  amount,
  categoryId: 'cat-entertainment',
  description: 'Netflix subscription',
  date: NOW - daysAgo * DAY,
  hashtags: [],
  isRecurring: false,
  type: 'expense',
  createdAt: 0,
  updatedAt: 0
});

describe('detectSubscriptions — price-hike detail', () => {
  it('exposes first and latest amounts so the UI can show ₹old → ₹new', () => {
    const detected = detectSubscriptions([charge(499, 65), charge(499, 35), charge(649, 5)], NOW);
    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({ firstAmount: 499, latestAmount: 649, priceCreep: true });
  });

  it('excludes income transactions (a salary credit is not a subscription)', () => {
    const income = (daysAgo: number): Expense => ({
      ...charge(120000, daysAgo),
      description: 'Monthly salary credit',
      categoryId: 'cat-inc-salary',
      type: 'income'
    });
    expect(detectSubscriptions([income(60), income(30), income(1)], NOW)).toHaveLength(0);
  });
});
