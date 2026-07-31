import type { Expense } from '@/core/db/types';

// Recurring-income detector — the inflow counterpart to the subscription
// detector. Finds income transactions that repeat at a regular cadence (salary,
// rent received, retainers) so the cash-flow forecast can project a payday even
// when the user never marked the income recurring by hand. Pure — no DB access.

export interface DetectedIncome {
  key: string; // normalized description (stable identity for confirm/dismiss)
  label: string; // most recent raw description, for display
  detectedAmount: number; // median amount
  intervalDays: number; // matched canonical cadence
  lastReceivedAt: number;
  nextExpectedAt: number; // next projected payday at/after today
  occurrenceCount: number;
}

const DAY_MS = 86_400_000;

// Income recurs less often than subscriptions — bias toward monthly+ cadences.
const KNOWN_INTERVALS: { days: number; tolerance: number }[] = [
  { days: 7, tolerance: 2 },
  { days: 14, tolerance: 3 },
  { days: 30, tolerance: 8 },
  { days: 91, tolerance: 15 },
  { days: 365, tolerance: 30 }
];

/** Lowercase, strip punctuation, collapse whitespace — the grouping identity. */
export function normalizeIncome(desc: string): string {
  return desc
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return sorted[mid] ?? 0;
}

function matchInterval(days: number): number | null {
  for (const spec of KNOWN_INTERVALS) {
    if (Math.abs(days - spec.days) <= spec.tolerance) return spec.days;
  }
  return null;
}

function nextOccurrence(from: number, intervalDays: number, todayStart: number): number {
  let next = from;
  while (next < todayStart) next += intervalDays * DAY_MS;
  return next;
}

/**
 * Detects recurring income from transaction history. Groups income transactions
 * by normalized description, matches the median gap to a canonical cadence, and
 * returns candidates sorted by amount descending. Filtering out income already
 * marked recurring is left to the caller.
 */
export function detectRecurringIncome(expenses: Expense[], nowMs: number): DetectedIncome[] {
  const todayStart = (() => {
    const d = new Date(nowMs);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();

  const groups = new Map<string, Expense[]>();
  for (const e of expenses) {
    if ((e.type ?? 'expense') !== 'income') continue;
    const key = normalizeIncome(e.description);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }

  const results: DetectedIncome[] = [];
  for (const [key, items] of groups) {
    if (items.length < 2) continue;
    const sorted = [...items].sort((a, b) => a.date - b.date);
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev && curr) intervals.push((curr.date - prev.date) / DAY_MS);
    }
    const matched = matchInterval(median(intervals));
    if (matched === null) continue;

    const last = sorted[sorted.length - 1];
    if (!last) continue;
    results.push({
      key,
      label: last.description.trim(),
      detectedAmount: median(sorted.map((e) => e.amount)),
      intervalDays: matched,
      lastReceivedAt: last.date,
      nextExpectedAt: nextOccurrence(last.date, matched, todayStart),
      occurrenceCount: items.length
    });
  }

  return results.sort((a, b) => b.detectedAmount - a.detectedAmount);
}
