// PPF "needs review" flag detection (2026-08-08) — mirrors `epfReviewFlags.ts`'s role for EPF.
// Computed ON DEMAND, never stored — same principle every other derived value in this feature
// already follows. This is the SINGLE function both the card's inline transaction-row badges and
// its card-level count call, so the two can never disagree with each other.
import type { PpfTransaction } from '@/core/db/types';
import { checkPpfInterestMismatch } from '@/core/portfolio/ppfInterestCalculator';
import type { PpfRateTable } from '@/core/portfolio/ppfInterestRates';
import { dateToFyStartYear } from '@/core/portfolio/ppfCalculations';

export interface PpfInterestMismatchFlag {
  kind: 'interestMismatch';
  txnId: string;
  recorded: number;
  calculated: number;
}

export type PpfReviewFlag = PpfInterestMismatchFlag;

/** Whether a logged interest transaction agrees with a fresh recalculation for its FY — the exact
 *  comparison this function's own caller (and, eventually, any interest-breakdown popup) should use,
 *  factored out here so nothing can disagree with anything else. Returns `null` if there's no rate
 *  table loaded, or if Penny's own recorded history doesn't reach back far enough to trust the
 *  recalculation (`basedOnIncompleteHistory`) — neither case is itself a mismatch, both mean "nothing
 *  to compare against yet," which is different from "compared and it disagreed." */
export function checkInterestMismatch(
  t: PpfTransaction,
  allTransactions: PpfTransaction[],
  rateTable: PpfRateTable | null
): { recorded: number; calculated: number; mismatched: boolean } | null {
  if (!rateTable) return null;
  const fy = dateToFyStartYear(t.date);
  const result = checkPpfInterestMismatch(t, allTransactions, rateTable, fy);
  if (!result || result.basedOnIncompleteHistory) return null;
  return { recorded: result.recorded, calculated: result.calculated, mismatched: result.mismatched };
}

/** Every "needs review" flag across a holding's PPF ledger — the single function both the card's
 *  inline transaction-row badges and its card-level count call (see `epfReviewFlags.ts`'s identical
 *  "single source of truth" rule for EPF). Today this only covers interest mismatches — PPF has no
 *  equivalent of EPF's wage-discrepancy check (no salary model to compare a deposit against). */
export function findAllPpfReviewFlags(transactions: PpfTransaction[], rateTable: PpfRateTable | null): PpfReviewFlag[] {
  const flags: PpfReviewFlag[] = [];
  for (const t of transactions) {
    if (t.type !== 'interest') continue;
    const check = checkInterestMismatch(t, transactions, rateTable);
    if (check?.mismatched) {
      flags.push({ kind: 'interestMismatch', txnId: t.id, recorded: check.recorded, calculated: check.calculated });
    }
  }
  return flags;
}
