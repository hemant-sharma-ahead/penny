import { useCallback, useMemo, useState } from 'react';
import { expensesRepo, subscriptionsRepo } from '@/core/db/repositories';
import { buildOccurrence } from '@/core/expenses/recurringDue';
import { buildReminders, reminderCounts, type Reminder, type ReminderState } from '@/core/reminders/reminders';
import { logActivity } from '@/core/db/activityLog';
import { useForecast } from './useForecast';

const STATE_KEY = 'penny_reminder_state';
const DAY_MS = 86_400_000;

function loadState(): ReminderState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ReminderState>) : {};
    return { snoozed: parsed.snoozed ?? {}, done: parsed.done ?? [] };
  } catch {
    return { snoozed: {}, done: [] };
  }
}

/**
 * Drives the header Reminders bell: derives near-term reminders from the forecast
 * + recurring-due inbox, holds snooze/done state locally, and exposes actions
 * (snooze, mark done, log a due bill, cancel a subscription). In-app only — no
 * notification APIs (real push → Phase 2).
 */
export function useReminders() {
  const { loading, events, dueRecurring, nowMs, reload } = useForecast();
  const [state, setState] = useState<ReminderState>(loadState);

  const persist = useCallback((next: ReminderState) => {
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    setState(next);
  }, []);

  const reminders = useMemo(
    () => buildReminders(events, dueRecurring, nowMs, state),
    [events, dueRecurring, nowMs, state]
  );
  const counts = useMemo(() => reminderCounts(reminders), [reminders]);

  const snooze = useCallback(
    (id: string, days: number) =>
      persist({ ...state, snoozed: { ...state.snoozed, [id]: Date.now() + days * DAY_MS } }),
    [state, persist]
  );

  const markDone = useCallback(
    (id: string) => {
      if (state.done.includes(id)) return;
      persist({ ...state, done: [...state.done, id] });
    },
    [state, persist]
  );

  /** Log a due recurring bill as a real transaction (reuses the Step 6 occurrence builder). */
  const log = useCallback(
    async (r: Reminder) => {
      if (!r.due) return;
      const txn = buildOccurrence(r.due.template, r.due.dueMs);
      await expensesRepo.put(txn);
      logActivity({
        action: 'CREATE',
        entityType: 'expense',
        entityId: txn.id,
        summary: `Logged ${txn.description} ₹${txn.amount}`
      });
      markDone(r.id);
      reload();
    },
    [markDone, reload]
  );

  /** Cancel the subscription behind a reminder. */
  const cancelSub = useCallback(
    async (r: Reminder) => {
      if (!r.subscriptionId) return;
      const sub = await subscriptionsRepo.get(r.subscriptionId);
      if (sub) {
        await subscriptionsRepo.put({ ...sub, status: 'cancelled', updatedAt: Date.now() });
        logActivity({
          action: 'UPDATE',
          entityType: 'subscription',
          entityId: sub.id,
          summary: `Cancelled ${sub.merchantCategory}`
        });
      }
      markDone(r.id);
      reload();
    },
    [markDone, reload]
  );

  return { loading, nowMs, reminders, counts, snooze, markDone, log, cancelSub };
}
