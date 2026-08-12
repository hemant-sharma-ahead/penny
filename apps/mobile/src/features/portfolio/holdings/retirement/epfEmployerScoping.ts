// Per-employer transaction ownership resolution — shared between `RetirementSheets.tsx`
// (`EpfAllTransactionsSheet`'s `employerFilter` scoping) and `EpfEmployerPickerSheet.tsx` (per-row
// transaction counts). Kept in its own components-free `.ts` file, not inlined in either `.tsx`, for
// the same Fast-Refresh reason `epfImportLogic.ts`'s own header comment documents — a `.tsx` exporting
// a component can't also export plain functions.
//
// See docs/plans/epf-passbook-import.md's 2026-08-11 follow-up round ("per-employer ledger").
import type { EpfEmployer, EpfTransaction } from '@/core/db/types';
import { epfResolveTxnEmployer } from '@/core/portfolio/epfCalculations';

/** Which employer ANY transaction (contribution or otherwise) belongs to — a thin re-export of
 *  `epfResolveTxnEmployer` (packages/core), which itself now handles every transaction type (not
 *  just contributions — see that function's own doc comment). Kept as a distinct name here since
 *  every call site in this feature already uses "owner" language for display-scoping purposes. */
export function resolveAnyTxnOwner(t: EpfTransaction, employers: EpfEmployer[]): EpfEmployer | null {
  return epfResolveTxnEmployer(t, employers);
}

/** Whether a CLOSED employer's PF balance looks like it hasn't been transferred to its successor
 *  yet — a real, recurring gap: EPF transfers can take months, and until one posts, the old
 *  employer's own PF account keeps existing (and earning interest — see `epfComputeAllMonths`'s own
 *  "an employer's balance keeps earning interest until transferred" handling). Heuristic, not
 *  certain: the immediate next employer (by `fromDate`) has no `transfer_in` transaction attributed
 *  to it. `false` for a still-current employer (nothing to transfer FROM yet) or one with no later
 *  employer at all (nothing to check against — e.g. the most recent job change hasn't been followed
 *  by a newer one). Always phrased as tentative in the UI — this can't distinguish "genuinely
 *  pending" from "already transferred via a route Penny has no record of" (e.g. claimed directly
 *  through the EPFO portal, never imported). */
export function epfHasPendingTransfer(
  employer: EpfEmployer,
  employers: EpfEmployer[],
  transactions: EpfTransaction[]
): boolean {
  if (!employer.toDate) return false;
  const successor = employers
    .filter((e) => e.id !== employer.id && e.fromDate >= employer.fromDate)
    .sort((a, b) => a.fromDate - b.fromDate)[0];
  if (!successor) return false;
  return !transactions.some((t) => t.type === 'transfer_in' && resolveAnyTxnOwner(t, employers)?.id === successor.id);
}
