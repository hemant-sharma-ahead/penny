import { useCallback, useEffect, useMemo, useState } from 'react';
import { expensesRepo, insurancePoliciesRepo, subscriptionsRepo } from '@/core/db/repositories';
import { buildOccurrence } from '@/core/expenses/recurringDue';
import { buildReminders, reminderCounts, type Reminder, type ReminderState } from '@/core/reminders/reminders';
import { logActivity } from '@/core/db/activityLog';
import { getJSON, setJSON } from '~/lib/storage';
import { useForecast } from '~/hooks/useForecast';
import { markPremiumPaid, type MarkPaidChoice } from '~/hooks/useInsurancePremiumActions';

const STATE_KEY = 'penny_reminder_state';
const DAY_MS = 86_400_000;
const EMPTY_STATE: ReminderState = { snoozed: {}, done: [] };

/**
 * RN port of apps/web-react/src/hooks/useReminders.ts — drives the header Reminders bell. Same
 * logic; only the persisted snooze/done state swaps synchronous `localStorage` for async
 * AsyncStorage (`~/lib/storage`), hydrated once on mount like PrivacyContext's default-mode load.
 */
export function useReminders() {
  const { loading, events, dueRecurring, nowMs, reload } = useForecast();
  const [state, setState] = useState<ReminderState>(EMPTY_STATE);

  useEffect(() => {
    let cancelled = false;
    void getJSON<Partial<ReminderState>>(STATE_KEY).then((parsed) => {
      if (cancelled || !parsed) return;
      setState({ snoozed: parsed.snoozed ?? {}, done: parsed.done ?? [] });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: ReminderState) => {
    setState(next);
    void setJSON(STATE_KEY, next);
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

  // Term/Life premium "Mark as paid" (insurance-redesign-v4.html §④/§⑦) — tapped from the bell, this
  // opens the SAME optional log/link/skip choice the Insurance screen's own form offers, not a fourth,
  // different interaction (per the mockup's own §⑦ note). Reuses the shared
  // `~/hooks/useInsurancePremiumActions.ts` write so both hook instances stay identical — this bell has
  // no `useInsurance()` instance of its own to call into (a fresh `Agent`/hook mount here would be a
  // second, independent local-state copy, not the fix), fetching the live policy record fresh by id
  // instead of caching one, consistent with this app's "never snapshot" rule for anything that can be
  // mutated by a stacked child action.
  const markInsurancePaid = useCallback(
    async (r: Reminder, choice: MarkPaidChoice) => {
      if (!r.policyId) return;
      const policy = await insurancePoliciesRepo.get(r.policyId);
      if (!policy) return;
      await markPremiumPaid(policy, choice);
      markDone(r.id);
      reload();
    },
    [markDone, reload]
  );

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

  return { loading, nowMs, reminders, counts, snooze, markDone, log, cancelSub, markInsurancePaid };
}
