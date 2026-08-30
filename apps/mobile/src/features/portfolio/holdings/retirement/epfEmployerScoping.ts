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

/** A SUGGESTED destination employer for a CLOSED employer's PF balance that hasn't shown up as a
 *  transfer-in credit anywhere yet — a real, recurring gap: EPF transfers can take months, and a lot of
 *  real EPFO passbooks never show an explicit transfer-in credit at all even when the money genuinely
 *  moved (found via real-device testing against a real multi-employer career: the OLD employer's own
 *  passbook shows a plain "Final Settlement"/withdrawal row with no "TRANSFER" wording anywhere, and the
 *  NEW employer's own opening balance checkpoint is a genuine 0 — EPFO's own record simply doesn't
 *  distinguish "settled to bank" from "settled via transfer" in the text). Left unresolved, this
 *  silently understates the holding's total corpus by exactly the amount that left the old account —
 *  see `RetirementSheets.tsx`'s "pending transfer" banner, which offers an explicit choice (record it as
 *  a transfer-in, picking any employer as the real destination, or confirm it really was withdrawn)
 *  instead of just noting the gap.
 *
 *  2026-08-30 fix — real reported bug: this used to always suggest the chronologically NEXT employer by
 *  `fromDate`, and considered a gap "resolved" only once THAT specific employer had any `transfer_in` at
 *  all. Real-world EPFO transfers don't work that way — per EPFO's own transfer rules, a transfer always
 *  targets whichever Member ID is CURRENTLY ACTIVE at the time the transfer is actually filed, not
 *  necessarily "whichever job came next" — so two different old, closed employers (e.g. two jobs held
 *  years apart) can both correctly transfer into the SAME later, still-current employer, filed together,
 *  skipping right over an employer that happened to sit chronologically in between. The suggestion now
 *  defaults to the CURRENTLY ACTIVE employer (no `toDate`) when one exists, falling back to the
 *  chronologically-next employer only when nothing is currently active — but it's still only ever a
 *  DEFAULT: the confirm step lets the user pick any other employer instead. "Already resolved" is now
 *  tracked via `EpfTransaction.transferredFromEmployerId` — an exact link back to THIS employer
 *  specifically, checked across every employer in the holding, not just whichever one happens to be
 *  suggested this time — so confirming a transfer to a non-default destination correctly stops the
 *  banner from re-appearing too.
 *
 *  `null` for a still-current employer (nothing to transfer FROM yet), one with no other employer at
 *  all to suggest, one the user has already explicitly answered "it was withdrawn" for
 *  (`pendingTransferDismissed`), or one that already has a real `transfer_in` recorded anywhere crediting
 *  it (via `transferredFromEmployerId`). */
export function epfPendingTransferSuccessor(
  employer: EpfEmployer,
  employers: EpfEmployer[],
  transactions: EpfTransaction[]
): EpfEmployer | null {
  if (!employer.toDate || employer.pendingTransferDismissed) return null;
  // Prefers the explicit `transferredFromEmployerId` link (set by the manual confirm flow, or by a
  // fresh import — see `epfImportLogic.ts`'s `resolveTransferSourceEmployerId`) but also falls back to
  // matching a transfer-in row's own `sourceParticulars` text against this employer's real `memberId`
  // — the exact same real, deterministic identification, just evaluated on demand rather than stamped
  // at commit time. Needed so an ALREADY-imported transfer-in row (from before that stamping existed)
  // is recognized too, without requiring the user to re-import anything.
  const alreadyResolved = transactions.some(
    (t) =>
      t.type === 'transfer_in' &&
      (t.transferredFromEmployerId === employer.id ||
        (employer.memberId && t.sourceParticulars?.includes(employer.memberId)))
  );
  if (alreadyResolved) return null;
  const currentlyActive = employers.find((e) => e.id !== employer.id && !e.toDate);
  if (currentlyActive) return currentlyActive;
  const nextByDate = employers
    .filter((e) => e.id !== employer.id && e.fromDate >= employer.fromDate)
    .sort((a, b) => a.fromDate - b.fromDate)[0];
  return nextByDate ?? null;
}

/** The real, already-confirmed transfer-in for a closed employer, if the user has already answered
 *  "It was transferred" for it (or a real import already recorded one — same `memberId` fallback
 *  matching as `epfPendingTransferSuccessor`, for the identical reason) — powers a small persistent
 *  confirmation once resolved, so the answer doesn't just silently disappear with no trace once given
 *  (2026-08-30). */
export function epfResolvedTransfer(
  employer: EpfEmployer,
  employers: EpfEmployer[],
  transactions: EpfTransaction[]
): { transaction: EpfTransaction; destination: EpfEmployer } | null {
  const transaction = transactions.find(
    (t) =>
      t.type === 'transfer_in' &&
      (t.transferredFromEmployerId === employer.id ||
        (employer.memberId && t.sourceParticulars?.includes(employer.memberId)))
  );
  if (!transaction) return null;
  const destination = resolveAnyTxnOwner(transaction, employers);
  return destination ? { transaction, destination } : null;
}

/** Convenience boolean wrapper around `epfPendingTransferSuccessor` for callers that only need to know
 *  whether a banner should show at all, not which successor it points to. */
export function epfHasPendingTransfer(
  employer: EpfEmployer,
  employers: EpfEmployer[],
  transactions: EpfTransaction[]
): boolean {
  return epfPendingTransferSuccessor(employer, employers, transactions) !== null;
}
