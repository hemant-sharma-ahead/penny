// PPF statement import reconciliation (2026-08-08). Deliberately NOT bank-statement import's fuzzy
// amount/date-proximity matcher, ported over — like EPF's own import (`epfReconciliation.ts`), PPF
// rows have a natural, EXACT key already: (type, date) for a deposit/withdrawal (a bank can only
// ever post one transaction on one day for one amount — if two exist, they're two rows, not one
// fuzzy match), or (type, financial year) for the once-a-year interest credit. This is a direct
// lookup, not fuzzy candidate scoring — same reasoning as EPF's, applies identically here.
import type { PpfTransaction, PpfTransactionType } from '@/core/db/types';
import { calculatePpfInterestForFy, type PpfInterestCalculationResult } from './ppfInterestCalculator';
import type { PpfRateTable } from './ppfInterestRates';
import type { ParsedPpfStatementRow } from './ppfStatementParser';
import { dateToFyStartYear } from './ppfCalculations';

/** One imported row's reconciliation outcome against whatever is already logged for the same key —
 *  see `EpfReconciliationItem` for the identical 3-case model this mirrors. */
export interface PpfReconciliationItem {
  kind: 'new' | 'matches' | 'conflict';
  type: PpfTransactionType;
  date: number;
  imported: number;
  /** Only set for 'matches'/'conflict' — the already-logged transaction this imported row was
   *  reconciled against. */
  existing?: PpfTransaction;
  /** The statement row's own narration — carried onto the written `PpfTransaction.sourceParticulars`
   *  if the imported value is kept. */
  sourceParticulars: string;
  /** Only populated for `type === 'interest'` when a rate table was supplied — a fresh recalculation
   *  for this row's financial year, using every other row/existing transaction Penny knows about, so
   *  a review screen can show "Imported: ₹X · Calculated: ₹Y" the same way EPF's import does.
   *  `null` if a rate table was supplied but the FY's rate isn't confirmed yet (nothing to compare
   *  against — not itself a discrepancy). Absent entirely (not even `null`) for non-interest rows. */
  calculatedInterest?: { amount: number; basedOnIncompleteHistory: boolean; mismatched: boolean } | null;
}

const AMOUNT_TOLERANCE = 1; // whole-rupee statements — anything beyond rounding is a genuine conflict

function sameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function findExistingDepositOrWithdrawal(
  existing: PpfTransaction[],
  type: PpfTransactionType,
  date: number
): PpfTransaction | undefined {
  // Same-day, same-type is the key — deliberately NOT also matching on amount: a same-day/same-type
  // match at a different amount is still the right "existing" to show as a conflict (e.g. a
  // manually-entered approximate figure later corrected by the real statement).
  return existing.find((t) => t.type === type && sameDay(t.date, date));
}

function findExistingInterestForFy(existing: PpfTransaction[], fyStartYear: number): PpfTransaction | undefined {
  return existing.find((t) => t.type === 'interest' && dateToFyStartYear(t.date) === fyStartYear);
}

/** Reconciles a full parsed PPF statement against whatever's already logged in
 *  `holding.assetMeta.ppfTransactions[]`. Every row is classified as one of the 3 cases — never
 *  silently written or silently dropped; the review screen decides what to do with each case.
 *
 *  `rateTable`, if supplied, additionally populates `calculatedInterest` on every interest-type row
 *  — recalculated using ALL context Penny has for that financial year: the already-logged
 *  transactions, PLUS every other row in this same statement (deposits/withdrawals, AND every OTHER
 *  financial year's own interest row — a freshly imported statement is often the FIRST time Penny
 *  has seen that history at all, so excluding it would understate the running balance for every FY
 *  after the first). Only THIS row's own FY's interest is excluded, to avoid circularity. Pass
 *  `null`/omit to skip this (e.g. while offline and the rate table genuinely isn't available) — the
 *  reconciliation itself (new/matches/conflict) works identically either way. */
export function reconcilePpfRows(
  rows: ParsedPpfStatementRow[],
  existingTransactions: PpfTransaction[],
  rateTable?: PpfRateTable | null
): PpfReconciliationItem[] {
  const parsedAsTransactions: PpfTransaction[] = rows.map((r, i) => ({
    id: `__parsed-${i}`,
    type: r.type,
    date: r.date,
    amount: r.amount
  }));

  return rows.map((row, i) => {
    const base = { type: row.type, date: row.date, imported: row.amount, sourceParticulars: row.narration };

    if (row.type === 'interest') {
      const fyStartYear = dateToFyStartYear(row.date);
      const existing = findExistingInterestForFy(existingTransactions, fyStartYear);

      // Only computed (and only included in the returned item at all — see `calcField` below) when
      // a rate table was actually supplied; `exactOptionalPropertyTypes` means we can't assign
      // `undefined` to a property typed `{...} | null`, so an omitted rate table must OMIT the key
      // entirely rather than set it to `undefined`.
      let calculatedInterest: { amount: number; basedOnIncompleteHistory: boolean; mismatched: boolean } | null = null;
      if (rateTable) {
        // Every other row/existing txn Penny knows about for this FY, EXCLUDING only THIS FY's own
        // interest row(s) — we're recalculating what this FY's interest SHOULD be, so it can't use
        // its own figure as an input (that would be circular). Every OTHER financial year's interest
        // — whether already logged or sitting elsewhere in this same freshly-parsed statement — is a
        // real, already-credited amount that legitimately forms part of the running balance for this
        // FY and must stay in context. A real 2026-08-24 bug lived here: the statement-side half of
        // this filter used to strip out ALL interest rows regardless of financial year
        // (`t.type !== 'interest'`), not just this FY's — so for a fresh multi-year import (the
        // normal case, since `existingTransactions` starts empty), every FY after the first computed
        // its comparison figure against a balance basis missing every prior year's real credited
        // interest, understating it more with each additional year. Confirmed against a real
        // multi-year PPF statement: only the very first FY calculated correctly; every later one was
        // wrong, growing worse each year — exactly the shape this filter gap produces. This never
        // corrupted anything committed (commit always writes the statement's own stated amount, never
        // this recalculation) — it only broke the review screen's "Imported vs Calculated" sanity
        // check, which is why it was only ever visible during import.
        const context = [
          ...existingTransactions.filter((t) => !(t.type === 'interest' && dateToFyStartYear(t.date) === fyStartYear)),
          ...parsedAsTransactions.filter(
            (t, j) => j !== i && !(t.type === 'interest' && dateToFyStartYear(t.date) === fyStartYear)
          )
        ];
        const result: PpfInterestCalculationResult = calculatePpfInterestForFy(context, fyStartYear, rateTable);
        calculatedInterest = result.rateFullyConfirmed
          ? {
              amount: result.interest,
              basedOnIncompleteHistory: result.basedOnIncompleteHistory,
              mismatched: Math.abs(result.interest - row.amount) > AMOUNT_TOLERANCE
            }
          : null;
      }
      const calcField = rateTable ? { calculatedInterest } : {};

      if (!existing) return { ...base, kind: 'new', ...calcField };
      return {
        ...base,
        kind: Math.abs(row.amount - existing.amount) <= AMOUNT_TOLERANCE ? 'matches' : 'conflict',
        existing,
        ...calcField
      };
    }

    const existing = findExistingDepositOrWithdrawal(existingTransactions, row.type, row.date);
    if (!existing) return { ...base, kind: 'new' };
    return {
      ...base,
      kind: Math.abs(row.amount - existing.amount) <= AMOUNT_TOLERANCE ? 'matches' : 'conflict',
      existing
    };
  });
}
