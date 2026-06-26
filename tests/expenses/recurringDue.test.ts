import { describe, expect, it } from 'vitest';
import { computeDueRecurring, buildOccurrence } from '@/core/expenses/recurringDue';
import type { Expense } from '@/core/db/types';

const DAY = 86_400_000;
const NOW = new Date('2026-06-26T10:00:00').getTime();

const e = (over: Partial<Expense>): Expense => ({
  id: Math.random().toString(36),
  amount: 799,
  categoryId: 'cat-utilities',
  description: 'Mobile bill',
  date: NOW,
  hashtags: [],
  isRecurring: false,
  type: 'expense',
  createdAt: 0,
  updatedAt: 0,
  ...over
});

describe('computeDueRecurring', () => {
  it('flags a recurring series whose next occurrence has passed', () => {
    const due = computeDueRecurring(
      [
        e({ description: 'Mobile bill', date: NOW - 63 * DAY }),
        e({ description: 'Mobile bill', date: NOW - 33 * DAY, isRecurring: true, recurringIntervalDays: 30 })
      ],
      NOW
    );
    expect(due).toHaveLength(1);
    expect(due[0]?.key).toBe('expense::mobile bill');
    expect(due[0]?.dueMs).toBe(new Date(new Date(NOW - 3 * DAY).setHours(0, 0, 0, 0)).getTime()); // 33 − 30
    expect(due[0]?.periodsOverdue).toBe(1);
  });

  it('does not flag a series already logged this period', () => {
    const due = computeDueRecurring(
      [e({ description: 'Rent', date: NOW - 5 * DAY, isRecurring: true, recurringIntervalDays: 30 })],
      NOW
    );
    expect(due).toHaveLength(0); // next due is ~25 days out
  });

  it('counts multiple overdue periods', () => {
    const due = computeDueRecurring(
      [e({ description: 'Gym', date: NOW - 65 * DAY, isRecurring: true, recurringIntervalDays: 30 })],
      NOW
    );
    expect(due[0]?.periodsOverdue).toBe(2); // 65 − 30 = 35 days overdue ⇒ 2 occurrences pending
  });

  it('ignores non-recurring series and transfers', () => {
    const due = computeDueRecurring(
      [
        e({ description: 'Coffee', date: NOW - 90 * DAY }), // not recurring
        e({ description: 'To savings', type: 'transfer', date: NOW - 90 * DAY, isRecurring: true, recurringIntervalDays: 30 })
      ],
      NOW
    );
    expect(due).toHaveLength(0);
  });
});

describe('buildOccurrence', () => {
  it('copies template fields, dates it to the due day, and clears recurring', () => {
    const template = e({ description: 'Mobile bill', amount: 799, isRecurring: true, recurringIntervalDays: 30, accountId: 'acc-1', paymentMode: 'upi' });
    const dueMs = NOW - 3 * DAY;
    const posted = buildOccurrence(template, dueMs);
    expect(posted).toMatchObject({ description: 'Mobile bill', amount: 799, accountId: 'acc-1', paymentMode: 'upi', isRecurring: false, date: dueMs, source: 'manual' });
    expect(posted.recurringIntervalDays).toBeUndefined();
    expect(posted.id).not.toBe(template.id);
  });
});
