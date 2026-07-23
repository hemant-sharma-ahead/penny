import { describe, expect, it } from 'vitest';
import { buildReminders, reminderCounts } from '@/core/reminders/reminders';
import type { CashFlowEvent } from '@/core/cashflow/forecaster';
import type { DueRecurring } from '@/core/expenses/recurringDue';
import type { Expense } from '@/core/db/types';

const DAY = 86_400_000;
const NOW = new Date('2026-06-26T10:00:00').getTime();
const todayStart = (() => {
  const d = new Date(NOW);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
})();
const day = (n: number) => todayStart + n * DAY;

const evt = (over: Partial<CashFlowEvent>): CashFlowEvent => ({
  id: 'e',
  label: 'X',
  type: 'subscription',
  direction: 'out',
  amount: 100,
  dueMs: day(2),
  ...over
});

const tmpl = (over: Partial<Expense> = {}): Expense => ({
  id: 't',
  amount: 1199,
  categoryId: 'cat-utilities',
  description: 'Broadband bill',
  date: NOW - 33 * DAY,
  hashtags: [],
  isRecurring: true,
  recurringIntervalDays: 30,
  type: 'expense',
  createdAt: 0,
  updatedAt: 0,
  ...over
});

const due: DueRecurring = { key: 'expense::broadband bill', template: tmpl(), dueMs: day(-3), periodsOverdue: 1 };

const empty = { snoozed: {}, done: [] };

describe('buildReminders', () => {
  it('includes overdue recurring (log) and upcoming outflows within 7 days', () => {
    const events = [
      evt({ id: 'sub-demo-sub-netflix-1', type: 'subscription', label: 'Streaming', amount: 649, dueMs: day(3) }),
      evt({ id: 'emi-l1-1', type: 'loan_emi', label: 'Home Loan', amount: 39400, dueMs: day(0) }),
      evt({ id: 'far', type: 'subscription', label: 'Faraway', dueMs: day(20) }), // beyond 7d → excluded
      evt({ id: 'inc', type: 'income', direction: 'in', label: 'Salary', dueMs: day(1) }) // inflow → excluded
    ];
    const reminders = buildReminders(events, [due], NOW, empty);
    expect(reminders.map((r) => r.label)).toEqual(['Broadband bill', 'Home Loan', 'Streaming']); // overdue → today → soon
    expect(reminders[0]).toMatchObject({ urgency: 'overdue', action: 'log' });
    expect(reminders[1]).toMatchObject({ urgency: 'today', action: 'none' });
    expect(reminders[2]).toMatchObject({ urgency: 'soon', action: 'cancel', subscriptionId: 'demo-sub-netflix' });
  });

  it('dedups a recurring bill present in both the overdue list and the forecast', () => {
    const events = [evt({ id: 'rec-x-1', type: 'recurring', label: 'Broadband bill', amount: 1199, dueMs: day(0) })];
    const reminders = buildReminders(events, [due], NOW, empty);
    expect(reminders.filter((r) => r.label === 'Broadband bill')).toHaveLength(1); // overdue one wins
  });

  it('hides snoozed and done reminders', () => {
    const events = [evt({ id: 'sub-a-1', label: 'A', dueMs: day(2) })];
    const reminders = buildReminders(events, [due], NOW, {
      snoozed: { 'sub-a-1': NOW + DAY },
      done: ['due:expense::broadband bill:' + day(-3)]
    });
    expect(reminders).toHaveLength(0);
  });

  it('counts overdue + today as urgent', () => {
    const reminders = buildReminders([evt({ id: 'sub-b-1', label: 'B', dueMs: day(4) })], [due], NOW, empty);
    expect(reminderCounts(reminders)).toEqual({ total: 2, urgent: 1 }); // overdue urgent, soon not
  });
});
