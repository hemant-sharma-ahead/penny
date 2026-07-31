import type { Expense, InsurancePolicy, Liability, Subscription } from '@/core/db/types';

export type CashFlowType = 'loan_emi' | 'subscription' | 'insurance' | 'recurring' | 'income';

export interface CashFlowEvent {
  id: string;
  label: string;
  type: CashFlowType;
  direction: 'in' | 'out';
  amount: number; // always positive; sign comes from `direction`
  dueMs: number; // midnight of due date
}

const DAY_MS = 86_400_000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Projects the next due date at/after `todayStart` from a last date + interval. */
function nextOccurrence(from: number, intervalDays: number, todayStart: number): number {
  let next = from;
  while (next < todayStart) next += intervalDays * DAY_MS;
  return startOfDay(next);
}

/** All occurrences in [todayStart, horizonEnd) of a series recurring every `intervalDays`. */
function occurrencesWithin(from: number, intervalDays: number, todayStart: number, horizonEnd: number): number[] {
  const out: number[] = [];
  for (let d = nextOccurrence(from, intervalDays, todayStart); d < horizonEnd; d += intervalDays * DAY_MS) {
    out.push(d);
  }
  return out;
}

/**
 * Forecasts dated cash-flow events within the horizon: loan EMIs, subscriptions,
 * insurance renewals, recurring expenses (out) and recurring income (in).
 */
export function forecastEvents(
  liabilities: Liability[],
  subscriptions: Subscription[],
  policies: InsurancePolicy[],
  expenses: Expense[],
  nowMs: number,
  horizonDays: number
): CashFlowEvent[] {
  const events: CashFlowEvent[] = [];
  const todayStart = startOfDay(nowMs);
  const horizonEnd = todayStart + horizonDays * DAY_MS;
  const now = new Date(nowMs);

  // Loan EMIs — one occurrence per month within the horizon (until the loan ends)
  for (const l of liabilities) {
    if (!l.emiAmount || l.emiAmount <= 0 || !l.emiDueDate) continue;
    // new Date(y, m, d) wraps month overflow correctly (e.g. month 12 → Jan next year)
    let m = now.getMonth();
    let dueMs = startOfDay(new Date(now.getFullYear(), m, l.emiDueDate).getTime());
    if (dueMs < todayStart) dueMs = startOfDay(new Date(now.getFullYear(), ++m, l.emiDueDate).getTime());
    while (dueMs < horizonEnd && (!l.endDate || dueMs <= l.endDate)) {
      events.push({
        id: `emi-${l.id}-${dueMs}`,
        label: l.name,
        type: 'loan_emi',
        direction: 'out',
        amount: l.emiAmount,
        dueMs
      });
      dueMs = startOfDay(new Date(now.getFullYear(), ++m, l.emiDueDate).getTime());
    }
  }

  // Subscriptions — every charge from lastChargedAt forward within the horizon. Only CONFIRMED
  // subscriptions count: unconfirmed ones are hidden from the Subscriptions tab, so they must not
  // silently drive the projection (otherwise Cash Flow shows a payment the user can't see or manage).
  for (const s of subscriptions) {
    if (!s.confirmedByUser || s.status === 'cancelled' || s.intervalDays <= 0 || !s.lastChargedAt) continue;
    for (const dueMs of occurrencesWithin(s.lastChargedAt, s.intervalDays, todayStart, horizonEnd)) {
      events.push({
        id: `sub-${s.id}-${dueMs}`,
        label: s.merchantCategory,
        type: 'subscription',
        direction: 'out',
        amount: s.detectedAmount,
        dueMs
      });
    }
  }

  // Insurance renewals within horizon
  for (const p of policies) {
    const dueMs = startOfDay(p.renewalDate);
    if (dueMs >= todayStart && dueMs < horizonEnd) {
      events.push({
        id: `ins-${p.id}`,
        label: `${p.insurer} renewal`,
        type: 'insurance',
        direction: 'out',
        amount: p.annualPremium,
        dueMs
      });
    }
  }

  // Recurring expenses (out) and recurring income (in) — project from last recorded date.
  // Transfers move money between own accounts (net-zero on total liquid) and are skipped.
  // A recurring series is logged every period, so collapse each (type + merchant)
  // to its most recent occurrence — otherwise every historical row would be
  // projected forward into a duplicate event.
  const recurringSeries = new Map<string, Expense>();
  for (const e of expenses) {
    if (!e.isRecurring || !e.recurringIntervalDays || e.recurringIntervalDays <= 0) continue;
    const kind = e.type ?? 'expense';
    if (kind === 'transfer') continue;
    const key = `${kind}::${e.description.trim().toLowerCase().replace(/\s+/g, ' ')}`;
    const cur = recurringSeries.get(key);
    if (!cur || e.date > cur.date) recurringSeries.set(key, e);
  }
  for (const e of recurringSeries.values()) {
    const interval = e.recurringIntervalDays as number;
    const kind = e.type ?? 'expense';
    for (const dueMs of occurrencesWithin(e.date, interval, todayStart, horizonEnd)) {
      if (kind === 'income') {
        events.push({
          id: `inc-${e.id}-${dueMs}`,
          label: e.description,
          type: 'income',
          direction: 'in',
          amount: e.amount,
          dueMs
        });
      } else {
        events.push({
          id: `rec-${e.id}-${dueMs}`,
          label: e.description,
          type: 'recurring',
          direction: 'out',
          amount: e.amount,
          dueMs
        });
      }
    }
  }

  return events.sort((a, b) => a.dueMs - b.dueMs);
}

export interface DayBalance {
  dayMs: number;
  balance: number;
}

export interface BalanceForecast {
  startBalance: number;
  daily: DayBalance[]; // end-of-day projected balance, today → horizon end
  lowest: DayBalance; // lowest projected balance over the horizon (incl. today)
  bufferBreachMs: number | null; // first day the balance falls below the buffer floor
  totalIn: number;
  totalOut: number;
  netFlow: number; // totalIn − totalOut over the horizon
  nextIncomeMs: number | null; // next projected payday
  daysToPayday: number | null;
  discretionary: number; // safe to spend until next income/period end (can be negative)
  perDay: number; // discretionary ÷ daysLeft
  daysLeft: number; // denominator used for perDay (until payday, else month-end)
}

/** Last calendar day of the month containing `ms`, at start-of-day. */
function endOfMonth(ms: number): number {
  const d = new Date(ms);
  return startOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime());
}

/**
 * Projects the running liquid balance forward from `startBalance` over the
 * horizon, and derives the lowest point, buffer breach, and a liquidity-based
 * "safe to spend" (current balance − committed outflows until next income −
 * buffer, divided by the days remaining in that window).
 */
export function projectBalance(
  startBalance: number,
  events: CashFlowEvent[],
  nowMs: number,
  horizonDays: number,
  bufferFloor: number
): BalanceForecast {
  const todayStart = startOfDay(nowMs);
  const horizonEnd = todayStart + horizonDays * DAY_MS;

  const deltaByDay = new Map<number, number>();
  let totalIn = 0;
  let totalOut = 0;
  let nextIncomeMs: number | null = null;
  for (const e of events) {
    if (e.dueMs < todayStart || e.dueMs >= horizonEnd) continue;
    const signed = e.direction === 'in' ? e.amount : -e.amount;
    deltaByDay.set(e.dueMs, (deltaByDay.get(e.dueMs) ?? 0) + signed);
    if (e.direction === 'in') {
      totalIn += e.amount;
      if (nextIncomeMs === null || e.dueMs < nextIncomeMs) nextIncomeMs = e.dueMs;
    } else {
      totalOut += e.amount;
    }
  }

  const daily: DayBalance[] = [];
  let balance = startBalance;
  let lowest: DayBalance = { dayMs: todayStart, balance: startBalance };
  let bufferBreachMs: number | null = null;
  for (let day = todayStart; day < horizonEnd; day += DAY_MS) {
    balance += deltaByDay.get(day) ?? 0;
    daily.push({ dayMs: day, balance });
    if (balance < lowest.balance) lowest = { dayMs: day, balance };
    if (bufferBreachMs === null && balance < bufferFloor) bufferBreachMs = day;
  }

  // Safe-to-spend window: until the next payday, else the end of this month.
  const periodEnd = nextIncomeMs ?? endOfMonth(todayStart);
  let committedOut = 0;
  for (const e of events) {
    if (e.direction === 'out' && e.dueMs >= todayStart && e.dueMs <= periodEnd) committedOut += e.amount;
  }
  const daysLeft = Math.max(1, Math.ceil((periodEnd - todayStart) / DAY_MS));
  const daysToPayday = nextIncomeMs === null ? null : Math.max(0, Math.round((nextIncomeMs - todayStart) / DAY_MS));
  const discretionary = startBalance - committedOut - bufferFloor;

  return {
    startBalance,
    daily,
    lowest,
    bufferBreachMs,
    totalIn,
    totalOut,
    netFlow: totalIn - totalOut,
    nextIncomeMs,
    daysToPayday,
    discretionary,
    perDay: discretionary / daysLeft,
    daysLeft
  };
}
