import { isLikelyCarryForward } from './importCategoryResolution';
import type { ParsedRow } from './importParsers';

/**
 * MoneyView-style monthly carry-forward markers ("Cash Forward" et al — see
 * `importCategoryResolution.ts`'s `isLikelyCarryForward`) record the same leftover cash once per
 * calendar month per account, purely as a continuity/bookkeeping artifact — never a real transaction
 * and never a transfer (there's no second account to pair with). Penny doesn't need MoneyView's
 * monthly buckets at all: it computes a running balance as `Account.openingBalance + sum of every
 * transaction's delta`, so only the chronologically-EARLIEST marker per account represents real money
 * that existed before tracked history began — every LATER marker for the same account is redundant,
 * because the real transactions in between already account for that same leftover amount. Importing a
 * later one too would double-count it and compound every subsequent month.
 *
 * Grouping is per `row.account` (not per category name, and not a single global cut) — each account's
 * carry-forward timeline is independent of every other account's.
 *
 * Returns the indices into `rows` (matching `ParsedRow[]` order) of every REDUNDANT (non-earliest)
 * carry-forward row. The earliest row per account is NOT included — it flows through the normal
 * category-tile resolution flow like any other row, just never pre-suggested as a transfer (see
 * `isLikelyCarryForward` no longer being part of `isLikelyTransfer`'s keyword list).
 */
export function identifyRedundantCarryForwardRows(rows: ParsedRow[]): Set<number> {
  const byAccount = new Map<string, { index: number; date: number }[]>();

  rows.forEach((row, index) => {
    if (!isLikelyCarryForward(row.categoryName)) return;
    const key = row.account?.trim() || '';
    const entries = byAccount.get(key) ?? [];
    entries.push({ index, date: row.date });
    byAccount.set(key, entries);
  });

  const redundant = new Set<number>();
  for (const entries of byAccount.values()) {
    if (entries.length <= 1) continue;
    const sortedByDate = [...entries].sort((a, b) => a.date - b.date);
    for (const entry of sortedByDate.slice(1)) redundant.add(entry.index);
  }
  return redundant;
}
