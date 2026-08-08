// EPF "needs review" flag detection (2026-08-xx) — see docs/plans/epf-passbook-import.md §9/§10.6.
// Computed ON DEMAND, never stored — same principle every other derived value in this feature
// already follows (the interest breakdown popup, `findMissingInterestFys`, etc.). This is the SINGLE
// function both `EpfAllTransactionsSheet`'s row badges and `RetirementCard`'s card-level count call,
// so the two can never disagree with each other (same "single source of truth" rule
// `epfComputeAllMonths` already established for real-vs-estimate months).
import type { EpfEmployer, EpfTransaction } from '@/core/db/types';
import {
  epfCheckWageDiscrepancy,
  epfEmployerForWagesMonth,
  type EpfWageDiscrepancy
} from '@/core/portfolio/epfCalculations';
import type { EpfRateTable } from '@/core/portfolio/epfInterestRates';
import { computeEpfInterestOnDemand, dateToFyStartYear, recordedInterestTotal } from './epfInterestOnDemand';

/** Matches `epfReconciliation.ts`'s own `AMOUNT_TOLERANCE` — real passbook/manually-typed amounts
 *  are whole rupees, so anything beyond a rounding difference is a genuine mismatch, not noise. */
const INTEREST_AMOUNT_TOLERANCE = 1;

export interface EpfInterestMismatchFlag {
  kind: 'interestMismatch';
  txnId: string;
  recorded: number;
  recomputed: number;
}

export interface EpfWageDiscrepancyFlag extends EpfWageDiscrepancy {
  kind: 'wageDiscrepancy';
  wagesMonth: string;
  employer: EpfEmployer;
}

export type EpfReviewFlag = EpfInterestMismatchFlag | EpfWageDiscrepancyFlag;

/** Whether a logged interest transaction agrees with a fresh recalculation for its FY — the exact
 *  comparison `EpfAllTransactionsSheet`'s breakdown popup banner already makes, factored out here so
 *  the popup, the row badge, and the card-level count can never disagree. Returns `null` if there's
 *  no rate table loaded yet (nothing to compare against — not itself a mismatch). */
export function checkInterestMismatch(
  t: EpfTransaction,
  employers: EpfEmployer[],
  transactions: EpfTransaction[],
  rateTable: EpfRateTable | null
): { recorded: number; recomputed: number; mismatched: boolean } | null {
  if (!rateTable) return null;
  const fy = dateToFyStartYear(t.date);
  const result = computeEpfInterestOnDemand(employers, transactions, rateTable, fy);
  const recomputed = result.employeeInterest + result.employerInterest;
  const recorded = recordedInterestTotal(t);
  return { recorded, recomputed, mismatched: Math.abs(recorded - recomputed) > INTEREST_AMOUNT_TOLERANCE };
}

/** Whether a logged REAL contribution disagrees with what its employer's CURRENT salary model would
 *  predict for that wages month — see `epfCheckWageDiscrepancy` (packages/core) for the actual
 *  comparison math. Prefers the transaction's own `employerId` (unambiguous even for a genuine
 *  mid-month employer switch, where two employers legitimately cover the same wages month); falls
 *  back to `epfEmployerForWagesMonth`'s date-range check (packages/core, shared with
 *  `epfExcelExport.ts`) for a transaction written before that field existed — which itself returns
 *  `null` rather than guessing when more than one employer's range covers the month. Returns `null`
 *  for anything that isn't a wagesMonth-bearing contribution, or whose employer can't be
 *  unambiguously resolved. */
export function checkWageDiscrepancy(
  t: EpfTransaction,
  employers: EpfEmployer[]
): (EpfWageDiscrepancy & { employer: EpfEmployer; wagesMonth: string }) | null {
  if (t.type !== 'contribution' || !t.wagesMonth) return null;
  const employer = t.employerId
    ? (employers.find((e) => e.id === t.employerId) ?? null)
    : epfEmployerForWagesMonth(employers, t.wagesMonth);
  if (!employer) return null;
  const discrepancy = epfCheckWageDiscrepancy(employer, t.wagesMonth, t.employeeAmount ?? 0);
  if (!discrepancy) return null;
  return { ...discrepancy, employer, wagesMonth: t.wagesMonth };
}

/** Every "needs review" flag across a holding's EPF ledger — the single function both the row
 *  badges (`EpfAllTransactionsSheet`) and the card-level count (`RetirementCard`) call, so they can
 *  never disagree (doc's "single source of truth" rule). */
export function findAllReviewFlags(
  employers: EpfEmployer[],
  transactions: EpfTransaction[],
  rateTable: EpfRateTable | null
): EpfReviewFlag[] {
  const flags: EpfReviewFlag[] = [];
  for (const t of transactions) {
    if (t.type === 'interest') {
      const check = checkInterestMismatch(t, employers, transactions, rateTable);
      if (check?.mismatched) {
        flags.push({ kind: 'interestMismatch', txnId: t.id, recorded: check.recorded, recomputed: check.recomputed });
      }
    } else if (t.type === 'contribution' && t.wagesMonth) {
      const check = checkWageDiscrepancy(t, employers);
      if (check) flags.push({ kind: 'wageDiscrepancy', ...check });
    }
  }
  return flags;
}
