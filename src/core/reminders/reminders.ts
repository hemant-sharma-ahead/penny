import type { CashFlowEvent, CashFlowType } from '@/core/cashflow/forecaster';
import type { DueRecurring } from '@/core/expenses/recurringDue';

// In-app reminders (Track 6): near-term outflow money events that need attention
// — overdue recurring bills plus anything due in the next 7 days (EMIs,
// subscriptions, insurance, recurring bills). Pure — derived from the forecast
// engine + the recurring-due inbox; no notifications/backend (Phase 2).

const DAY_MS = 86_400_000;
const SOON_DAYS = 7;

export type ReminderUrgency = 'overdue' | 'today' | 'soon';
export type ReminderAction = 'log' | 'cancel' | 'none';

export interface Reminder {
  id: string; // stable across renders for snooze/done state
  label: string;
  amount: number;
  dueMs: number;
  kind: CashFlowType;
  urgency: ReminderUrgency;
  action: ReminderAction;
  subscriptionId?: string; // when action === 'cancel'
  due?: DueRecurring; // when action === 'log' (carries the template to post)
}

export interface ReminderState {
  snoozed: Record<string, number>; // id → snooze-until epoch ms
  done: string[]; // ids marked done
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Subscription id from a forecast event id `sub-<id>-<dueMs>` (id may contain dashes). */
function subscriptionIdOf(eventId: string): string {
  return eventId.replace(/^sub-/, '').replace(/-\d+$/, '');
}

const URGENCY_ORDER: Record<ReminderUrgency, number> = { overdue: 0, today: 1, soon: 2 };

/**
 * Builds the visible reminder list: overdue recurring bills (actionable "log")
 * + upcoming outflow events within 7 days, minus snoozed/done items, sorted
 * overdue → today → soon then by due date.
 */
export function buildReminders(
  events: CashFlowEvent[],
  dueRecurring: DueRecurring[],
  nowMs: number,
  state: ReminderState
): Reminder[] {
  const todayStart = startOfDay(nowMs);
  const soonEnd = todayStart + SOON_DAYS * DAY_MS;
  const out: Reminder[] = [];
  const seenRecurring = new Set<string>(); // dedup recurring bills against the forecast

  // Overdue recurring bills — actionable, highest priority.
  for (const d of dueRecurring) {
    out.push({
      id: `due:${d.key}:${d.dueMs}`,
      label: d.template.description,
      amount: d.template.amount,
      dueMs: d.dueMs,
      kind: 'recurring',
      urgency: 'overdue',
      action: 'log',
      due: d
    });
    seenRecurring.add(norm(d.template.description));
  }

  // Upcoming outflows within the next 7 days.
  for (const e of events) {
    if (e.direction !== 'out' || e.dueMs < todayStart || e.dueMs >= soonEnd) continue;
    if (e.type === 'recurring' && seenRecurring.has(norm(e.label))) continue; // already overdue above
    out.push({
      id: e.id,
      label: e.label,
      amount: e.amount,
      dueMs: e.dueMs,
      kind: e.type,
      urgency: e.dueMs <= todayStart ? 'today' : 'soon',
      action: e.type === 'subscription' ? 'cancel' : 'none',
      ...(e.type === 'subscription' ? { subscriptionId: subscriptionIdOf(e.id) } : {})
    });
  }

  return out
    .filter((r) => {
      if (state.done.includes(r.id)) return false;
      const until = state.snoozed[r.id];
      return until === undefined || until <= nowMs;
    })
    .sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] || a.dueMs - b.dueMs);
}

/** Badge/summary counts. `urgent` (overdue + due today) drives the header badge. */
export function reminderCounts(reminders: Reminder[]): { total: number; urgent: number } {
  return {
    total: reminders.length,
    urgent: reminders.filter((r) => r.urgency === 'overdue' || r.urgency === 'today').length
  };
}
