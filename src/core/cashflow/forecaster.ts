import type { Expense, InsurancePolicy, Liability, Subscription } from '@/core/db/types';

export type CashFlowType = 'loan_emi' | 'subscription' | 'insurance' | 'recurring';

export interface CashFlowEvent {
  id: string;
  label: string;
  type: CashFlowType;
  amount: number;
  dueMs: number; // midnight of due date
}

const DAY_MS = 86_400_000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

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

  // Loan EMIs — find next due date within horizon
  for (const l of liabilities) {
    if (!l.emiAmount || l.emiAmount <= 0 || !l.emiDueDate) continue;
    // new Date(y, m, d) wraps month overflow correctly (e.g. month 12 → Jan next year)
    const thisDue = new Date(now.getFullYear(), now.getMonth(), l.emiDueDate);
    const dueDate =
      thisDue.getTime() >= todayStart ? thisDue : new Date(now.getFullYear(), now.getMonth() + 1, l.emiDueDate);
    const dueMs = startOfDay(dueDate.getTime());
    if (dueMs < horizonEnd) {
      events.push({ id: `emi-${l.id}`, label: l.name, type: 'loan_emi', amount: l.emiAmount, dueMs });
    }
  }

  // Subscriptions — project from lastChargedAt forward by intervalDays
  for (const s of subscriptions) {
    if (s.status === 'cancelled' || s.intervalDays <= 0 || !s.lastChargedAt) continue;
    let next = s.lastChargedAt;
    while (next < todayStart) next += s.intervalDays * DAY_MS;
    const dueMs = startOfDay(next);
    if (dueMs < horizonEnd) {
      events.push({
        id: `sub-${s.id}`,
        label: s.merchantCategory,
        type: 'subscription',
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
        amount: p.annualPremium,
        dueMs
      });
    }
  }

  // Recurring expenses — project from last recorded date
  for (const e of expenses) {
    if (!e.isRecurring || !e.recurringIntervalDays || e.recurringIntervalDays <= 0) continue;
    let next = e.date;
    while (next < todayStart) next += e.recurringIntervalDays * DAY_MS;
    const dueMs = startOfDay(next);
    if (dueMs < horizonEnd) {
      events.push({ id: `rec-${e.id}`, label: e.description, type: 'recurring', amount: e.amount, dueMs });
    }
  }

  return events.sort((a, b) => a.dueMs - b.dueMs);
}
