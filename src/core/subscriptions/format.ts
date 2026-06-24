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

/** Stable identity key for a subscription (merchant + interval), used to de-dupe detections. */
export function subKey(s: { merchantCategory: string; intervalDays: number }): string {
  return `${s.merchantCategory}:${s.intervalDays}`;
}
