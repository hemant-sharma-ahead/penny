/** Title-cases a merchant category for display, e.g. "netflix" → "Netflix". */
export function displayName(cat: string): string {
  return cat.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Human-readable billing interval, e.g. 30 → "monthly". */
export function intervalLabel(days: number): string {
  if (days === 7) return 'weekly';
  if (days === 14) return 'fortnightly';
  if (days === 30) return 'monthly';
  if (days === 91) return 'quarterly';
  if (days === 365) return 'annual';
  return `every ${days}d`;
}

/** Normalises any billing interval to an equivalent monthly amount. */
export function toMonthly(amount: number, intervalDays: number): number {
  return (amount / intervalDays) * 30;
}

/** Equivalent annual cost for a billing interval. */
export function toAnnual(amount: number, intervalDays: number): number {
  return (amount / intervalDays) * 365;
}

const DAY_MS = 86_400_000;

/** Next renewal/charge date projected from the last charge, or null if unknown. */
export function nextRenewal(sub: { intervalDays: number; lastChargedAt?: number }, nowMs: number): number | null {
  if (!sub.lastChargedAt || sub.intervalDays <= 0) return null;
  const todayStart = new Date(nowMs).setHours(0, 0, 0, 0);
  let next = sub.lastChargedAt;
  while (next < todayStart) next += sub.intervalDays * DAY_MS;
  return next;
}

/** A confirmed subscription looks unused/zombie if it hasn't charged in 2+ intervals. */
export function isDormant(sub: { intervalDays: number; lastChargedAt?: number }, nowMs: number): boolean {
  if (!sub.lastChargedAt || sub.intervalDays <= 0) return false;
  return nowMs - sub.lastChargedAt > sub.intervalDays * 2 * DAY_MS;
}

/** Stable identity key for a subscription (merchant + interval), used to de-dupe detections. */
export function subKey(s: { merchantCategory: string; intervalDays: number }): string {
  return `${s.merchantCategory}:${s.intervalDays}`;
}
