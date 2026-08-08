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
  // interest/transfer_in/withdrawal/advance are single-amount transactions today (see
  // EpfTransaction's `amount` field) — modelled here as an employee-side amount for comparison
  // purposes, since that's the only balance stream a manually-logged interest entry has ever
  // actually captured (see docs/plans/epf-passbook-import.md §6: interest is entirely manual today,
  // and the existing "Add transaction" sheet only ever asks for one combined amount for these
  // types, never a separate employee/employer split the way a contribution does).
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
