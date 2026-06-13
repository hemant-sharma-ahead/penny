import type { Expense, SubscriptionStatus } from '@/core/db/types';

export interface DetectedSubscription {
  merchantCategory: string;
  detectedAmount: number;
  intervalDays: number;
  status: SubscriptionStatus;
  trialEndsAt?: number;
  lastChargedAt?: number;
  occurrenceCount: number;
  priceCreep: boolean;
  dormant: boolean;
  estimatedMonthly: number;
}

// Known recurring intervals with tolerance (days)
const KNOWN_INTERVALS: { days: number; tolerance: number }[] = [
  { days: 7, tolerance: 2 },
  { days: 14, tolerance: 3 },
  { days: 30, tolerance: 8 },
  { days: 91, tolerance: 15 },
  { days: 365, tolerance: 30 }
];

// Pass 1 helper: strip to lowercase alphanum + spaces
function normalize(desc: string): string {
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
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

// Pass 2 helper: match a computed median interval to a canonical frequency
function matchInterval(days: number): number | null {
  for (const spec of KNOWN_INTERVALS) {
    if (Math.abs(days - spec.days) <= spec.tolerance) return spec.days;
  }
  return null;
}

/**
 * 3-pass subscription detector.
 *
 * Pass 1: group expenses by normalized description.
 * Pass 2: compute day-intervals, match against canonical frequencies.
 * Pass 3: enrich each candidate with trial / price-creep / dormant flags.
 *
 * Returns candidates sorted by estimated monthly cost descending.
 * Pure function — no DB access.
 */
export function detectSubscriptions(expenses: Expense[], nowMs: number): DetectedSubscription[] {
  // Pass 1 — group by normalized description
  const groups = new Map<string, Expense[]>();
  for (const e of expenses) {
    const key = normalize(e.description);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }

  const results: DetectedSubscription[] = [];

  for (const [key, items] of groups) {
    if (items.length < 2) continue;

    // Pass 2 — compute day intervals between consecutive charges
    const sorted = [...items].sort((a, b) => a.date - b.date);
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev !== undefined && curr !== undefined) {
        intervals.push((curr.date - prev.date) / 86_400_000);
      }
    }

    const medianInterval = median(intervals);
    const matched = matchInterval(medianInterval);
    if (matched === null) continue;

    // Pass 3 — enrich
    const amounts = sorted.map((e) => e.amount);
    const detectedAmount = median(amounts);
    const firstAmount = amounts[0] ?? 0;
    const lastAmount = amounts[amounts.length - 1] ?? 0;
    const firstItem = sorted[0];
    const lastItem = sorted[sorted.length - 1];
    const lastChargedAt = lastItem?.date;
    const firstChargedAt = firstItem?.date;

    // Trial: ≤2 occurrences, first charge within last 60 days
    let status: SubscriptionStatus = 'active';
    let trialEndsAt: number | undefined;
    if (items.length <= 2 && firstChargedAt !== undefined && nowMs - firstChargedAt < 60 * 86_400_000) {
      status = 'trial';
      if (lastChargedAt !== undefined) {
        trialEndsAt = lastChargedAt + matched * 86_400_000;
      }
    }

    // Price creep: latest charge is >10% more than the earliest
    const priceCreep = firstAmount > 0 && lastAmount > firstAmount * 1.1;

    // Dormant: last charge was more than 2× the interval ago
    const dormant = lastChargedAt !== undefined && nowMs - lastChargedAt > matched * 2 * 86_400_000;

    const candidate: DetectedSubscription = {
      merchantCategory: key,
      detectedAmount,
      intervalDays: matched,
      status,
      occurrenceCount: items.length,
      priceCreep,
      dormant,
      estimatedMonthly: (detectedAmount / matched) * 30
    };
    if (trialEndsAt !== undefined) candidate.trialEndsAt = trialEndsAt;
    if (lastChargedAt !== undefined) candidate.lastChargedAt = lastChargedAt;

    results.push(candidate);
  }

  return results.sort((a, b) => b.estimatedMonthly - a.estimatedMonthly);
}
