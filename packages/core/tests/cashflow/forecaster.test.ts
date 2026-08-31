import { describe, expect, it } from 'vitest';
import { forecastEvents, projectBalance, type CashFlowEvent } from '@/core/cashflow/forecaster';
import type { Expense, InsurancePolicy } from '@/core/db/types';

const DAY = 86_400_000;
const NOW = new Date('2026-06-10T10:00:00').getTime();
const todayStart = (() => {
  const d = new Date(NOW);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
})();

const day = (n: number) => todayStart + n * DAY;

const makeExpense = (over: Partial<Expense>): Expense => ({
  id: 'x',
  amount: 1000,
  categoryId: 'c',
  description: 'desc',
  date: NOW,
  hashtags: [],
  isRecurring: true,
  recurringIntervalDays: 30,
  createdAt: 0,
  updatedAt: 0,
  ...over
});

const out = (id: string, amount: number, d: number): CashFlowEvent => ({
  id,
  label: id,
  type: 'recurring',
  direction: 'out',
  amount,
  dueMs: d
});
const inc = (id: string, amount: number, d: number): CashFlowEvent => ({
  id,
  label: id,
  type: 'income',
  direction: 'in',
  amount,
  dueMs: d
});

describe('forecastEvents — recurring income vs expense direction', () => {
  it('treats recurring income as an inflow, not an outflow (regression)', () => {
    const events = forecastEvents(
      [],
      [],
      [],
      [
        makeExpense({ id: 'salary', type: 'income', amount: 50000, description: 'Salary' }),
        makeExpense({ id: 'rent', type: 'expense', amount: 20000, description: 'Rent' }),
        makeExpense({ id: 'move', type: 'transfer', amount: 5000, description: 'To savings' })
      ],
      NOW,
      40
    );
    const salary = events.find((e) => e.label === 'Salary' && e.direction === 'in');
    const rent = events.find((e) => e.label === 'Rent' && e.direction === 'out');
    expect(salary).toMatchObject({ type: 'income', amount: 50000 });
    expect(rent).toMatchObject({ type: 'recurring', amount: 20000 });
    // transfers are skipped entirely
    expect(events.some((e) => e.id.includes('move'))).toBe(false);
  });

  it('collapses a multi-month recurring series to a single projected event', () => {
    // The same subscription logged three months running, each flagged recurring.
    const events = forecastEvents(
      [],
      [],
      [],
      [
        makeExpense({ id: 'n1', description: 'Netflix', amount: 649, date: NOW - 65 * DAY }),
        makeExpense({ id: 'n2', description: 'Netflix', amount: 649, date: NOW - 35 * DAY }),
        makeExpense({ id: 'n3', description: 'Netflix', amount: 649, date: NOW - 5 * DAY })
      ],
      NOW,
      40
    );
    const netflix = events.filter((e) => e.label === 'Netflix');
    expect(netflix).toHaveLength(1); // one occurrence in a 40-day window, not three duplicates
    expect(netflix[0]?.id.startsWith('rec-n3')).toBe(true); // projected from the most recent occurrence
  });

  it('repeats a recurring series across a multi-month horizon', () => {
    // Monthly rent over a 95-day horizon → ~3 occurrences (this month + next two).
    const events = forecastEvents(
      [],
      [],
      [],
      [makeExpense({ id: 'rent', description: 'Rent', amount: 22000, date: NOW - 2 * DAY, recurringIntervalDays: 30 })],
      NOW,
      95
    );
    const rent = events.filter((e) => e.label === 'Rent');
    expect(rent.length).toBe(3);
    // strictly increasing, ~30 days apart, all unique ids
    expect(new Set(rent.map((e) => e.id)).size).toBe(3);
  });
});

const makePolicy = (over: Partial<InsurancePolicy> = {}): InsurancePolicy => ({
  id: 'p1',
  type: 'term',
  insurer: 'HDFC Life',
  coverageAmount: 10000000,
  annualPremium: 12000,
  renewalDate: NOW + 400 * DAY, // far outside the horizon in every test below
  createdAt: 0,
  updatedAt: 0,
  ...over
});

describe('forecastEvents — insurance', () => {
  it('emits one event per due-schedule occurrence for a Term/Life policy with a schedule set', () => {
    const p = makePolicy({ type: 'term', paymentFrequency: 'M', nextPremiumDueDate: NOW, annualPremium: 12000 });
    const events = forecastEvents([], [], [p], [], NOW, 95);
    const insEvents = events.filter((e) => e.type === 'insurance');
    expect(insEvents.length).toBe(4); // ~95 days / 30 ≈ 3-4 monthly occurrences
    expect(insEvents.every((e) => e.amount === 1000)).toBe(true);
    expect(insEvents.every((e) => e.policyId === 'p1')).toBe(true);
  });

  it('falls back to a single flat annual renewal event when no schedule is set', () => {
    const p = makePolicy({ type: 'health', renewalDate: NOW + 5 * DAY });
    const events = forecastEvents([], [], [p], [], NOW, 40);
    const insEvents = events.filter((e) => e.type === 'insurance');
    expect(insEvents).toHaveLength(1);
    expect(insEvents[0]).toMatchObject({ id: 'ins-p1', amount: 12000 });
    expect(insEvents[0]?.policyId).toBeUndefined();
  });

  it('falls back to the flat annual event for Term/Life with Single premium (no recurring schedule)', () => {
    const p = makePolicy({ type: 'term', paymentFrequency: 'S', renewalDate: NOW + 5 * DAY });
    const events = forecastEvents([], [], [p], [], NOW, 40);
    expect(events.filter((e) => e.type === 'insurance')).toHaveLength(1);
  });

  it('emits NO insurance event at all for a Term/Life policy that finished a Limited Pay term (paid up) — a real gap, fixed 2026-08-31', () => {
    // "Pay for 7 years, stay covered for 15", 8 years in — pay term long done, still well within cover.
    // `nextPremiumDueDate` is left unset here, matching what `applyMarkAsPaid()` actually returns once
    // the pay term completes (see `premiumSchedule.ts`'s doc comment) — before this fix, an undefined
    // `nextPremiumDueDate` was indistinguishable from "no schedule was ever set", so this fell into the
    // `else` branch and incorrectly resurrected the stale flat `renewalDate` below as a real event.
    const start = NOW - 8 * 365 * DAY;
    const p = makePolicy({
      type: 'term',
      paymentFrequency: 'A',
      premiumPaymentTerm: 'limited',
      limitedPayYears: 7,
      startDate: start,
      endDate: NOW + 7 * 365 * DAY,
      renewalDate: NOW + 5 * DAY // stale leftover value — must NOT leak through as a fallback event
    });
    const events = forecastEvents([], [], [p], [], NOW, 400);
    expect(events.filter((e) => e.type === 'insurance')).toHaveLength(0);
  });
});

describe('projectBalance', () => {
  it('projects a running balance, lowest point, and net flow', () => {
    const f = projectBalance(
      10000,
      [out('a', 5000, day(2)), inc('s', 30000, day(10)), out('b', 3000, day(15))],
      NOW,
      31,
      2000
    );
    expect(f.startBalance).toBe(10000);
    expect(f.totalOut).toBe(8000);
    expect(f.totalIn).toBe(30000);
    expect(f.netFlow).toBe(22000);
    expect(f.lowest.balance).toBe(5000); // after the day-2 outflow, before payday
    expect(f.bufferBreachMs).toBeNull(); // never dips below 2000
  });

  it('flags a buffer breach with its date', () => {
    const f = projectBalance(6000, [out('a', 5000, day(1))], NOW, 31, 2000);
    expect(f.lowest.balance).toBe(1000);
    expect(f.bufferBreachMs).toBe(day(1));
  });

  it('computes liquidity-based safe-to-spend until the next payday', () => {
    const f = projectBalance(10000, [out('a', 5000, day(2)), inc('s', 30000, day(10))], NOW, 31, 2000);
    expect(f.nextIncomeMs).toBe(day(10));
    expect(f.daysToPayday).toBe(10);
    expect(f.daysLeft).toBe(10);
    expect(f.discretionary).toBe(3000); // 10000 − 5000 committed − 2000 buffer
    expect(f.perDay).toBe(300); // 3000 / 10
  });

  it('falls back to month-end when no payday is forecast', () => {
    const f = projectBalance(10000, [out('a', 4000, day(3))], NOW, 31, 0);
    expect(f.nextIncomeMs).toBeNull();
    expect(f.daysToPayday).toBeNull();
    // 2026-06-10 → month-end 2026-06-30 = 20 days out
    expect(f.daysLeft).toBe(20);
    expect(f.discretionary).toBe(6000); // 10000 − 4000 committed − 0 buffer
  });
});
