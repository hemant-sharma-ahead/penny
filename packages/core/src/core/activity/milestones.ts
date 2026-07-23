// Pure milestone detection from the activity log — celebratory moments for the Story tab.
import type { ActivityLog } from '@/core/db/types';
import { toDateKey } from '@/lib/date';

export interface Milestone {
  key: string; // stable id so we celebrate each milestone only once
  label: string;
  icon: string;
}

const TXN_TIERS = [1000, 500, 250, 100, 50, 25, 10, 1];
const DAY_TIERS = [365, 180, 100, 30, 7];

/** The most impressive milestone reached so far (or null). Used for the Story banner + one-time confetti. */
export function detectMilestone(entries: ActivityLog[]): Milestone | null {
  let txns = 0;
  const days = new Set<string>();
  for (const e of entries) {
    if (e.entityType === 'system' || e.action === 'CHECKPOINT') continue;
    days.add(toDateKey(e.timestamp));
    if (e.entityType === 'expense' && e.action === 'CREATE') txns += 1;
    if (e.entityType === 'expense' && e.action === 'IMPORT') txns += e.entityCount ?? 0;
  }

  const txTier = TXN_TIERS.find((t) => txns >= t);
  const dayTier = DAY_TIERS.find((t) => days.size >= t);

  // Prefer the larger "deal": a day milestone of 30+ outranks small txn counts.
  if (dayTier && dayTier >= 30 && (!txTier || txTier < 100)) {
    return { key: `day-${dayTier}`, label: `${dayTier} days of tracking 🎯`, icon: 'ti-calendar-check' };
  }
  if (txTier) {
    return {
      key: `txn-${txTier}`,
      label: `${txTier} transaction${txTier === 1 ? '' : 's'} tracked 🎉`,
      icon: 'ti-confetti'
    };
  }
  if (dayTier) {
    return { key: `day-${dayTier}`, label: `${dayTier} days of tracking 🎯`, icon: 'ti-calendar-check' };
  }
  return null;
}
