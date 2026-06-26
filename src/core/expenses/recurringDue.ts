import type { Expense } from '@/core/db/types';
import { normalizeMerchant } from './merchantMemory';

// Recurring auto-post inbox (Track 6): recurring expenses/income are forecast-only
// and never create the real transaction. This finds series whose next occurrence
// is due (or overdue) so the user can confirm and log it. Pure — no DB access.

const DAY_MS = 86_400_000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface DueRecurring {
  key: string; // `${type}::${normalizedDescription}`
  template: Expense; // the recurring row whose fields are copied when posting
  dueMs: number; // the earliest unposted occurrence (start of day)
  periodsOverdue: number; // ≥1; how many occurrences are pending
}

/**
 * Finds recurring series whose next occurrence is due at/before today. A series
 * is keyed by (type + normalized description); its cadence comes from the most
 * recent `isRecurring` row (the template), and "due" is measured from the most
 * recent occurrence of any kind (so a just-posted occurrence advances it).
 */
export function computeDueRecurring(expenses: Expense[], nowMs: number): DueRecurring[] {
  const todayStart = startOfDay(nowMs);

  const groups = new Map<string, { template?: Expense; lastDate: number }>();
  for (const e of expenses) {
    const kind = e.type ?? 'expense';
    if (kind === 'transfer') continue;
    const norm = normalizeMerchant(e.description);
    if (!norm) continue;
    const key = `${kind}::${norm}`;
    const g = groups.get(key) ?? { lastDate: -Infinity };
    if (e.date > g.lastDate) g.lastDate = e.date;
    if (e.isRecurring && e.recurringIntervalDays && e.recurringIntervalDays > 0) {
      if (!g.template || e.date > g.template.date) g.template = e;
    }
    groups.set(key, g);
  }

  const due: DueRecurring[] = [];
  for (const [key, g] of groups) {
    const interval = g.template?.recurringIntervalDays;
    if (!g.template || !interval) continue;
    const nextDue = startOfDay(g.lastDate) + interval * DAY_MS;
    if (nextDue > todayStart) continue; // not due yet (today counts as due)
    const periodsOverdue = Math.floor((todayStart - nextDue) / (interval * DAY_MS)) + 1;
    due.push({ key, template: g.template, dueMs: nextDue, periodsOverdue });
  }

  return due.sort((a, b) => a.dueMs - b.dueMs);
}

/** Builds a concrete transaction to log for a due occurrence (copies the template, not recurring). */
export function buildOccurrence(template: Expense, dueMs: number): Expense {
  const now = Date.now();
  const { recurringIntervalDays: _drop, ...rest } = template;
  void _drop;
  return {
    ...rest,
    id: crypto.randomUUID(),
    date: dueMs,
    isRecurring: false,
    source: 'manual',
    createdAt: now,
    updatedAt: now
  };
}
