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
  epfMonthKeyOf,
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

export interface EpfJoiningDateContradictionFlag {
  kind: 'joiningDateContradiction';
  employer: EpfEmployer;
  /** The earliest real contribution wage month found that falls before the confirmed `fromDate`. */
  earlierWagesMonth: string;
}

export type EpfReviewFlag = EpfInterestMismatchFlag | EpfWageDiscrepancyFlag | EpfJoiningDateContradictionFlag;

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
 *  unambiguously resolved.
 *
 *  2026-08-xx fix — skips the employer's OWN joining/leaving month entirely. A pro-rata partial month
 *  is EXPECTED there (by construction, always "lower than a full month would predict") — that's not a
 *  genuine wage discrepancy, it's the whole reason the dedicated join/leave-date confirm flow exists
 *  (`EpfAllTransactionsSheet`'s `selectedMonth` popup) — which now owns that month's own note/action.
 *  Before this fix, a joining/leaving month's row showed a permanent, never-resolvable "lower than
 *  predicted" warning with no path to actually confirm anything. */
export function checkWageDiscrepancy(
  t: EpfTransaction,
  employers: EpfEmployer[]
): (EpfWageDiscrepancy & { employer: EpfEmployer; wagesMonth: string }) | null {
  if (t.type !== 'contribution' || !t.wagesMonth) return null;
  const employer = t.employerId
    ? (employers.find((e) => e.id === t.employerId) ?? null)
    : epfEmployerForWagesMonth(employers, t.wagesMonth);
  if (!employer) return null;
  const fromMonth = epfMonthKeyOf(employer.fromDate);
  const toMonth = employer.toDate ? epfMonthKeyOf(employer.toDate) : null;
  if (t.wagesMonth === fromMonth || t.wagesMonth === toMonth) return null;
  const discrepancy = epfCheckWageDiscrepancy(employer, t.wagesMonth, t.employeeAmount ?? 0);
  if (!discrepancy) return null;
  return { ...discrepancy, employer, wagesMonth: t.wagesMonth };
}

/** An employer whose joining date was explicitly CONFIRMED (`joiningDateConfirmed`, via the
 *  "New employer detected" import-time setup step) but a LATER import revealed a real contribution
 *  from before that confirmed date. `extendEmployerCoverage` (`epfImportLogic.ts`) deliberately never
 *  silently overrides a confirmed `fromDate` — this surfaces the disagreement instead of hiding it or
 *  picking a side, matching this file's "never silently drop or silently trust" principle. Never
 *  fires for an unconfirmed employer (nothing was promised, so there's nothing to contradict — that
 *  case just extends `fromDate` silently, same as before this flag existed). Non-blocking.
 *
 *  2026-08-xx fix — compares at MONTH granularity (`epfMonthKeyOf`), not raw epoch ms. The original
 *  version compared a wage month's own 1st-of-month timestamp directly against `employer.fromDate`
 *  (a specific DAY, by design — a pro-rata joining date is rarely the 1st) — which made this fire a
 *  false positive for literally every employer's own joining month: e.g. joined 15 May 2025, so
 *  `fromDate` is mid-May, but the joining month's own contribution has `wagesMonth: "2025-05"`, whose
 *  1st-of-month (1 May) is numerically BEFORE 15 May even though it's the SAME month, not an earlier
 *  one. Only a contribution from a calendar month strictly before the confirmed joining month is a
 *  genuine contradiction. */
export function checkJoiningDateContradiction(
  employer: EpfEmployer,
  employers: EpfEmployer[],
  transactions: EpfTransaction[]
): EpfJoiningDateContradictionFlag | null {
  if (!employer.joiningDateConfirmed) return null;
  const fromMonth = epfMonthKeyOf(employer.fromDate);
  let earliest: string | null = null;
  for (const t of transactions) {
    if (t.type !== 'contribution' || !t.wagesMonth) continue;
    const owner = t.employerId
      ? (employers.find((e) => e.id === t.employerId) ?? null)
      : epfEmployerForWagesMonth(employers, t.wagesMonth);
    if (owner?.id !== employer.id) continue;
    if (t.wagesMonth < fromMonth && (earliest === null || t.wagesMonth < earliest)) earliest = t.wagesMonth;
  }
  return earliest ? { kind: 'joiningDateContradiction', employer, earlierWagesMonth: earliest } : null;
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
      // `checkInterestMismatch` itself always reports the raw disagreement (never hides it — the
      // popup still shows both figures even once acknowledged) — the "needs review" COUNT is what
      // respects an explicit "Keep recorded" acknowledgment, same as every other dismiss-tracking
      // flag in this app. See `EpfTransaction.interestMismatchAcknowledged`'s own doc comment.
      const check = checkInterestMismatch(t, employers, transactions, rateTable);
      if (check?.mismatched && !t.interestMismatchAcknowledged) {
        flags.push({ kind: 'interestMismatch', txnId: t.id, recorded: check.recorded, recomputed: check.recomputed });
      }
    } else if (t.type === 'contribution' && t.wagesMonth) {
      const check = checkWageDiscrepancy(t, employers);
      if (check) flags.push({ kind: 'wageDiscrepancy', ...check });
    }
  }
  for (const emp of employers) {
    const contradiction = checkJoiningDateContradiction(emp, employers, transactions);
    if (contradiction) flags.push(contradiction);
  }
  return flags;
}
