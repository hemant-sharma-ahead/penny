import { isLikelyCarryForward } from './importCategoryResolution';
import type { ParsedRow } from './importParsers';

/**
 * MoneyView-style monthly carry-forward markers ("Cash Forward" et al — see
 * `importCategoryResolution.ts`'s `isLikelyCarryForward`) record the same leftover cash once per
 * calendar month per account, purely as a continuity/bookkeeping artifact — never a real transaction
 * and never a transfer (there's no second account to pair with). Penny doesn't need MoneyView's
 * monthly buckets at all: it computes a running balance as `Account.openingBalance + sum of every
 * transaction's delta`, so importing ANY carry-forward marker would double-count money already
 * represented by the real transactions around it.
 *
 * 2026-08-23 (item 72, 8th batch real-device testing pass): previously the chronologically-EARLIEST
 * marker per account was deliberately kept OUT of this excluded set, on the theory that it represented a
 * real opening-balance-like row rather than a redundant repeat. Per explicit decision, every
 * carry-forward row — including the earliest — is now treated identically and excluded; accounts
 * created during import still seed `openingBalance: 0` exactly as every other import-created account
 * already does (`AccountsSection.tsx`/`useImport.ts` both hardcode this) — this function's job is purely
 * "exclude every carry-forward row," nothing else.
 *
 * Returns the indices into `rows` (matching `ParsedRow[]` order) of every carry-forward row.
 */
export function identifyRedundantCarryForwardRows(rows: ParsedRow[]): Set<number> {
  const excluded = new Set<number>();
  rows.forEach((row, index) => {
    if (isLikelyCarryForward(row.categoryName)) excluded.add(index);
  });
  return excluded;
}
