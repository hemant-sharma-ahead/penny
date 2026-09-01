// EPF passbook import reconciliation (2026-08-07) — see docs/plans/epf-passbook-import.md §6.5.
// Deliberately NOT bank-statement import's fuzzy amount/date-proximity matcher, ported over — EPF
// contribution (and interest) rows have a natural, EXACT key already: (memberId, wagesMonth, type)
// for a contribution, or (memberId, financial year, type) for a once-a-year event like interest —
// since EPFO can only ever fund one contribution per employer per wage-month, and credits interest
// at most once per employer per year. This is a direct lookup, not fuzzy candidate scoring.
import type { EpfTransaction, EpfTransactionType } from '@/core/db/types';
import type { ParsedEpfPassbookRow } from './epfPassbookParser';

interface EpfAmounts {
  employeeAmount: number;
  employerAmount: number;
  pensionAmount: number;
}

/** One imported item's reconciliation outcome against whatever is already logged for the same key
 *  — see the design doc's §6.5 for the exact 3-case model. `imported` carries just the comparable
 *  amounts (both a contribution row and a once-a-year event like interest reduce to this shape for
 *  comparison purposes) plus enough context to construct the real `EpfTransaction` if the caller
 *  decides to write it. */
export interface EpfReconciliationItem {
  kind: 'new' | 'matches' | 'conflict';
  type: EpfTransactionType;
  /** "YYYY-MM" for a contribution (its real wage month); undefined for a once-a-year event like
   *  interest, which has no wage month of its own. */
  wagesMonth?: string;
  imported: EpfAmounts;
  /** Only set for 'matches'/'conflict' — the already-logged transaction this imported item was
   *  reconciled against. */
  existing?: EpfTransaction;
  /** Provenance to carry onto the written `EpfTransaction.sourceParticulars` if the imported value
   *  is kept — a contribution row's own passbook label, or a synthesized label for a once-a-year
   *  event. */
  sourceParticulars: string;
  /** epoch ms — the real transaction/deposit date for a contribution row, or the FY-end date for a
   *  once-a-year event (matching how a real passbook dates its own "Int. Updated upto" row). */
  date: number;
}

/** A trivial rounding tolerance for "already agrees" — real passbook amounts are whole rupees, so
 *  anything beyond a rounding difference is a genuine conflict, not noise. */
const AMOUNT_TOLERANCE = 1;

function amountsAgree(a: EpfAmounts, b: EpfAmounts): boolean {
  return (
    Math.abs(a.employeeAmount - b.employeeAmount) <= AMOUNT_TOLERANCE &&
    Math.abs(a.employerAmount - b.employerAmount) <= AMOUNT_TOLERANCE &&
    Math.abs(a.pensionAmount - b.pensionAmount) <= AMOUNT_TOLERANCE
  );
}

function existingAmounts(t: EpfTransaction): EpfAmounts {
  if (t.type === 'contribution') {
    return {
      employeeAmount: t.employeeAmount ?? 0,
      employerAmount: t.employerAmount ?? 0,
      pensionAmount: t.pensionAmount ?? 0
    };
  }
  // interest/transfer_in/withdrawal/advance: prefer the real employee/employer split when the
  // transaction actually has one — every import-created transaction of these types has carried a
  // real split since 2026-08-11 (`epfImportLogic.ts`'s `buildImportedTxn`), and withdrawal/advance
  // specifically only started reliably carrying `employerAmount` as of the mid-year-withdrawal fix
  // (2026-08-xx) — before that, its employer-side amount was silently dropped at write time, which
  // is exactly why this comparison needs to check for a real split rather than assuming there never
  // is one. Falls back to a plain employee-side `amount` ONLY for a genuinely legacy transaction with
  // no split at all — the one shape a manually-typed "Add transaction" entry of these types has ever
  // produced (see docs/plans/epf-passbook-import.md §6). Mirrors `recordedInterestTotal()`'s own
  // identical fallback convention in `epfInterestOnDemand.ts`, for consistency.
  if (t.employeeAmount != null || t.employerAmount != null) {
    return { employeeAmount: t.employeeAmount ?? 0, employerAmount: t.employerAmount ?? 0, pensionAmount: 0 };
  }
  return { employeeAmount: t.amount ?? 0, employerAmount: 0, pensionAmount: 0 };
}

/** Reconciles a full parsed passbook's contribution rows against an employer's already-logged
 *  `EpfTransaction`s, keyed by `wagesMonth`. Every row is classified as one of the 3 cases — never
 *  silently written or silently dropped; the caller's review screen decides what to actually do
 *  with each case (see the design doc's §6.5: 'new'/'matches' can be applied automatically or
 *  quietly summarized, 'conflict' must show both values side by side with the imported value
 *  pre-selected as the default). */
export function reconcileEpfContributionRows(
  parsedRows: ParsedEpfPassbookRow[],
  existingTransactions: EpfTransaction[]
): EpfReconciliationItem[] {
  const existingByWagesMonth = new Map<string, EpfTransaction>();
  for (const t of existingTransactions) {
    if (t.type === 'contribution' && t.wagesMonth) existingByWagesMonth.set(t.wagesMonth, t);
  }

  return parsedRows.map((row) => {
    const imported: EpfAmounts = {
      employeeAmount: row.employeeAmount,
      employerAmount: row.employerAmount,
      pensionAmount: row.pensionAmount
    };
    const existing = existingByWagesMonth.get(row.wagesMonth);
    const base = {
      type: 'contribution' as const,
      wagesMonth: row.wagesMonth,
      imported,
      sourceParticulars: row.particulars,
      date: row.date
    };
    if (!existing) return { ...base, kind: 'new' };
    return { ...base, kind: amountsAgree(imported, existingAmounts(existing)) ? 'matches' : 'conflict', existing };
  });
}

/** Reconciles a single once-a-year balance event (the passbook's own credited interest for the
 *  year — see `ParsedEpfPassbook.creditedInterest` — or, since this feature's post-launch parser
 *  fix, a transfer-in/withdrawal row detected in the transaction table) against whatever's already
 *  logged for that (type, financial year) — none of these have a `wagesMonth` of their own, so
 *  they're matched by which financial year an existing entry's own `date` falls inside instead.
 *  Returns null if there's nothing to reconcile (e.g. the passbook hasn't had this year's interest
 *  credited yet — a normal, expected state, not an error).
 *
 *  `eventDate`/`label` let a caller with a genuine specific date/description (e.g. a real transfer
 *  row's own parsed date and particulars) use them instead of the FY-end-date/"Int. Updated" default
 *  built for the once-a-year interest case this function originally covered. */
export function reconcileEpfBalanceEvent(
  type: EpfTransactionType,
  fyStartYear: number,
  amounts: EpfAmounts | null,
  existingTransactions: EpfTransaction[],
  eventDate?: number,
  label?: string
): EpfReconciliationItem | null {
  if (!amounts) return null;

  const fyStartMs = new Date(fyStartYear, 3, 1).getTime();
  const fyEndMs = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime();
  const existing = existingTransactions.find((t) => t.type === type && t.date >= fyStartMs && t.date <= fyEndMs);

  const base = {
    type,
    imported: amounts,
    sourceParticulars: label ?? `Int. Updated — FY${fyStartYear}-${String(fyStartYear + 1).slice(2)}`,
    date: eventDate ?? fyEndMs
  };
  if (!existing) return { ...base, kind: 'new' };
  return { ...base, kind: amountsAgree(amounts, existingAmounts(existing)) ? 'matches' : 'conflict', existing };
}

/** Reconciles ONE transfer_in/withdrawal ROW against whatever's already logged at its own EXACT real
 *  date — deliberately NOT `reconcileEpfBalanceEvent`'s "one event per (type, financial year)" model,
 *  which assumes at most one such event happens per FY. Real bug this fixes (2026-08-30, found via a
 *  real multi-employer transfer): a single FY can genuinely contain SEVERAL distinct transfer_in
 *  events — e.g. the real principal transfer posting on one date, followed months later by a separate
 *  "TRANSFER IN - INTEREST AMOUNT ONLY" catch-up credit on another — `reconcileUnit`'s old aggregate-
 *  by-type-per-unit approach summed every same-type row in the unit into ONE combined item dated to
 *  the LATEST one, silently discarding the real, earlier date the principal actually moved on. Matching
 *  by each row's own exact real date instead (day precision, straight from the passbook) correctly
 *  keeps every genuinely distinct event as its own item — two real events happening to land on the
 *  exact same calendar day is the one case this can't distinguish, an acceptable, very rare edge case
 *  given real passbook data. */
export function reconcileEpfBalanceEventAtDate(
  type: EpfTransactionType,
  amounts: EpfAmounts,
  date: number,
  particulars: string,
  existingTransactions: EpfTransaction[]
): EpfReconciliationItem {
  const existing = existingTransactions.find((t) => t.type === type && t.date === date);
  const base = { type, imported: amounts, sourceParticulars: particulars, date };
  if (!existing) return { ...base, kind: 'new' };
  return { ...base, kind: amountsAgree(amounts, existingAmounts(existing)) ? 'matches' : 'conflict', existing };
}
