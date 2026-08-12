// On-demand PPF interest helpers (2026-08-08) — mirrors `epfInterestOnDemand.ts`'s role for EPF:
// thin orchestration over the already-built, already-tested core primitives
// (`calculatePpfInterestForFy`, `checkPpfInterestMismatch`), specific to how *this* screen
// (`RetirementCard.tsx`) needs to call them. Nothing here recomputes or second-guesses the core
// accrual rule itself (PPF's real 5th-of-month rule, genuinely different from EPF's own timing —
// see `ppfInterestCalculator.ts`'s header comment).
import type { PpfTransaction } from '@/core/db/types';
import { calculatePpfInterestForFy, type PpfInterestCalculationResult } from '@/core/portfolio/ppfInterestCalculator';
import type { PpfRateTable } from '@/core/portfolio/ppfInterestRates';
import { dateToFyStartYear, fyLabel } from '@/core/portfolio/ppfCalculations';

export { dateToFyStartYear, fyLabel };

/** Runs the core accrual simulation on demand for one financial year, excluding any existing
 *  `interest`-type transaction already recorded for that FY (we're recalculating what it SHOULD be
 *  from deposits/withdrawals alone, never feeding a previously recorded interest figure into its own
 *  recalculation) — shared by the FY-end nudge banner's "calculate it for me" future use and
 *  `findAllPpfReviewFlags`'s mismatch check. Always recomputed fresh, never stored. */
export function computePpfInterestOnDemand(
  transactions: PpfTransaction[],
  rateTable: PpfRateTable,
  fyStartYear: number
): PpfInterestCalculationResult {
  const others = transactions.filter((t) => !(t.type === 'interest' && dateToFyStartYear(t.date) === fyStartYear));
  return calculatePpfInterestForFy(others, fyStartYear, rateTable);
}

/** Every past, fully-closed financial year (i.e. on or before the last March 31) since the account's
 *  opening date with no `interest`-type transaction recorded at all — powers the FY-end nudge
 *  banner(s) on `RetirementCard`, mirroring EPF's `findMissingInterestFys` exactly. Returns `[]` if
 *  the account's opening date isn't known yet (nothing to bound the search by) — never guesses a
 *  starting point. */
export function findMissingPpfInterestFys(
  transactions: PpfTransaction[],
  ppfOpeningDate: number | undefined
): number[] {
  if (ppfOpeningDate == null) return [];
  const earliestFy = dateToFyStartYear(ppfOpeningDate);
  const currentFy = dateToFyStartYear(Date.now());
  const lastClosedFy = currentFy - 1;
  if (lastClosedFy < earliestFy) return [];

  const interestFys = new Set(transactions.filter((t) => t.type === 'interest').map((t) => dateToFyStartYear(t.date)));
  const missing: number[] = [];
  for (let fy = earliestFy; fy <= lastClosedFy; fy++) {
    if (!interestFys.has(fy)) missing.push(fy);
  }
  return missing;
}
