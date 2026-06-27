// Pure ledger math for the person-centric IOU module (Phase 1.5 Track 1).
// No React, no repo access — unit-testable in isolation.
import type { LedgerEntry } from '@/core/db/types';

/** Sub-rupee residue counts as settled for labels only — exact amounts are always stored. */
export const SETTLED_EPSILON = 1;

/**
 * Net contribution of one entry to the running balance.
 * Positive ⇒ moves toward "they owe you"; negative ⇒ moves toward "you owe them".
 * - lent: you lent → they owe you more (+)
 * - borrowed: you borrowed → you owe them more (−)
 * - settlement they_paid_you: they repaid you → reduces what they owe (−)
 * - settlement you_paid_them: you repaid them → reduces what you owe (+)
 */
export function signedAmount(entry: LedgerEntry): number {
  switch (entry.kind) {
    case 'lent':
      return entry.amount;
    case 'borrowed':
      return -entry.amount;
    case 'settlement':
      return entry.settleDirection === 'you_paid_them' ? entry.amount : -entry.amount;
  }
}

/** Net balance with one person. Positive ⇒ they owe you; negative ⇒ you owe them. */
export function netBalance(entries: LedgerEntry[]): number {
  return entries.reduce((sum, e) => sum + signedAmount(e), 0);
}

/** personId → net balance, across all entries. */
export function balanceByPerson(entries: LedgerEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    map.set(e.personId, (map.get(e.personId) ?? 0) + signedAmount(e));
  }
  return map;
}

/** A balance is "settled" when its magnitude is below a rupee (display heuristic only). */
export function isSettled(net: number): boolean {
  return Math.abs(net) < SETTLED_EPSILON;
}

/** Total others owe you — sum of positive net balances. */
export function totalOwedToYou(balances: Map<string, number>): number {
  let sum = 0;
  for (const net of balances.values()) if (net > 0) sum += net;
  return sum;
}

/** Total you owe others — sum of the magnitudes of negative net balances. */
export function totalYouOwe(balances: Map<string, number>): number {
  let sum = 0;
  for (const net of balances.values()) if (net < 0) sum += -net;
  return sum;
}

/** Open (non-settlement) entries whose due date has passed. */
export function overdueEntries(entries: LedgerEntry[], nowMs: number): LedgerEntry[] {
  return entries.filter((e) => e.kind !== 'settlement' && e.dueDate !== undefined && e.dueDate < nowMs);
}
