import { describe, expect, it } from 'vitest';
import { detectRecurringIncome, normalizeIncome } from '@/core/cashflow/incomeDetector';
import type { Expense } from '@/core/db/types';

const DAY = 86_400_000;
const NOW = new Date('2026-06-20T10:00:00').getTime();

const income = (over: Partial<Expense>): Expense => ({
  id: Math.random().toString(36),
  amount: 50000,
  categoryId: 'cat-salary',
  description: 'Salary',
  date: NOW,
  hashtags: [],
  isRecurring: false,
  type: 'income',
  createdAt: 0,
  updatedAt: 0,
  ...over
});

describe('normalizeIncome', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeIncome('  ACME  Corp.  Salary! ')).toBe('acme corp salary');
  });
});

describe('detectRecurringIncome', () => {
  it('detects a monthly salary and projects the next payday', () => {
    const got = detectRecurringIncome(
      [
        income({ description: 'Salary', amount: 50000, date: NOW - 60 * DAY }),
        income({ description: 'Salary', amount: 50000, date: NOW - 30 * DAY }),
        income({ description: 'salary', amount: 52000, date: NOW - 1 * DAY })
      ],
      NOW
    );
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ key: 'salary', intervalDays: 30, occurrenceCount: 3 });
    expect(got[0]?.detectedAmount).toBe(50000); // median of 50k/50k/52k
    expect(got[0]?.nextExpectedAt).toBeGreaterThanOrEqual(NOW); // next payday is in the future
  });

  it('ignores one-off income and expense transactions', () => {
    const got = detectRecurringIncome(
      [
        income({ description: 'Diwali bonus', date: NOW - 10 * DAY }),
        income({ description: 'Salary', type: 'expense', date: NOW - 30 * DAY }), // not income
        income({ description: 'Salary', type: 'expense', date: NOW }) // not income
      ],
      NOW
    );
    expect(got).toHaveLength(0);
  });

  it('does not match irregular gaps', () => {
    const got = detectRecurringIncome(
      [income({ description: 'Freelance', date: NOW - 50 * DAY }), income({ description: 'Freelance', date: NOW })],
      NOW
    );
    expect(got).toHaveLength(0); // 50-day gap matches no canonical cadence
  });
});
