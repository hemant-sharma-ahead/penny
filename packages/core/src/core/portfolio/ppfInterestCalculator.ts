// PPF annual interest calculator (2026-08-08). Lets a PPF statement import show "Imported: ₹X ·
// Calculated: ₹Y" for interest rows, the same sanity-check EPF's import already does — see
// `epfInterestCalculator.ts` for that precedent. One real difference from EPF's accrual rule below.
import type { PpfTransaction } from '@/core/db/types';
import { lookupRateForMonth, type PpfRateTable } from './ppfInterestRates';

/** The accrual rule (real PPF rule, confirmed independently — see this feature's research trail in
 *  `ppfInterestRates.ts`'s doc comment): interest for a calendar month is calculated on the LOWEST
 *  balance the account held between the close of the 5th day and the end of that month. A deposit
 *  made ON OR BEFORE the 5th counts toward that month's balance immediately; a deposit made AFTER
 *  the 5th earns nothing for that month and only starts counting from the following month's 5th-day
 *  checkpoint onward. A withdrawal at any point in the window can only ever LOWER that month's
 *  figure below whatever the 5th-day balance was (deposits can't create a new minimum inside the
 *  window, only later decreases can). This is a genuinely different accrual timing than EPF's own
 *  rule (EPF: a contribution never earns interest in its own deposit month, only from the month
 *  after) — the two must not be copy-pasted into each other.
 *
 *  Interest is summed across all 12 months (April→March) and credited as ONE lump figure at FY-end,
 *  matching real passbooks — never compounded mid-year.
 */

export interface PpfInterestMonthTrace {
  /** "YYYY-MM" */
  month: string;
  /** The lowest balance the account held between the close of the 5th and the end of this month —
   *  the figure interest is actually calculated on. */
  lowestBalance: number;
  /** `null` if not yet confirmed, matching `lookupRateForMonth`'s own contract. */
  ratePct: number | null;
  /** Always 0 when `ratePct` is `null` — never a guess. */
  interest: number;
}

export interface PpfInterestCalculationResult {
  /** Rounded to the nearest rupee, matching how a real passbook displays it — not rounded per month. */
  interest: number;
  /** Balance at FY-end plus this FY's credited interest — what next FY's opening balance should be. */
  closingBalance: number;
  /** False if any month in the FY had no confirmed rate available — the caller should surface "rate
   *  not yet available for FY X" rather than trust a partial/zero result computed against a gap. */
  rateFullyConfirmed: boolean;
  /** True when the earliest transaction Penny knows about for this account postdates this FY's
   *  April 1st — meaning the true opening balance isn't actually known (some prior year's activity
   *  was never recorded/imported), so `interest`/`closingBalance` are a lower bound computed only
   *  from what's on record, not a verified figure. Surface this before flagging a "mismatch" against
   *  an imported/recorded interest amount — an apparent mismatch may just be missing history, not a
   *  wrong recorded figure. */
  basedOnIncompleteHistory: boolean;
  trace: PpfInterestMonthTrace[];
}

const FY_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]; // Apr..Mar, 1-indexed calendar months

function fyMonthDates(fyStartYear: number): { year: number; month: number }[] {
  return FY_MONTHS.map((month, i) => ({ year: i < 9 ? fyStartYear : fyStartYear + 1, month }));
}

function signedAmount(t: PpfTransaction): number {
  return t.type === 'withdrawal' ? -t.amount : t.amount; // deposit and interest both add
}

function balanceAsOf(transactions: PpfTransaction[], atMs: number): number {
  return transactions.filter((t) => t.date <= atMs).reduce((sum, t) => sum + signedAmount(t), 0);
}

/** The lowest balance held between the close of the 5th and the end of the given calendar month —
 *  see this file's header doc comment for the exact rule. */
function lowestBalanceForMonth(transactions: PpfTransaction[], year: number, month: number): number {
  const fifthMs = new Date(year, month - 1, 5, 23, 59, 59, 999).getTime();
  const lastDayMs = new Date(year, month, 0, 23, 59, 59, 999).getTime();

  let running = balanceAsOf(transactions, fifthMs);
  let lowest = running;

  const laterTxns = transactions.filter((t) => t.date > fifthMs && t.date <= lastDayMs).sort((a, b) => a.date - b.date);
  for (const t of laterTxns) {
    running += signedAmount(t);
    if (running < lowest) lowest = running;
  }
  return lowest;
}

/** Simulates one financial year's PPF interest accrual from whatever real transactions are on
 *  record — unlike EPF, there's no formula-estimate fallback here: PPF has no salary/contribution
 *  model to estimate from, only whatever deposits/withdrawals were actually logged or imported. */
export function calculatePpfInterestForFy(
  transactions: PpfTransaction[],
  fyStartYear: number,
  rateTable: PpfRateTable
): PpfInterestCalculationResult {
  const months = fyMonthDates(fyStartYear);
  const trace: PpfInterestMonthTrace[] = [];
  let interest = 0;
  let rateFullyConfirmed = true;

  for (const { year, month } of months) {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const ratePct = lookupRateForMonth(rateTable, monthStr);
    const lowestBalance = lowestBalanceForMonth(transactions, year, month);
    let monthInterest = 0;
    if (ratePct === null) rateFullyConfirmed = false;
    else {
      monthInterest = lowestBalance * (ratePct / 12 / 100);
      interest += monthInterest;
    }
    trace.push({ month: monthStr, lowestBalance, ratePct, interest: monthInterest });
  }

  const fyStartMs = new Date(fyStartYear, 3, 1).getTime(); // 1 April
  const fyEndMs = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime(); // 31 March
  const earliestTxnMs = transactions.length > 0 ? Math.min(...transactions.map((t) => t.date)) : null;
  const basedOnIncompleteHistory = earliestTxnMs === null || earliestTxnMs > fyStartMs;

  const roundedInterest = Math.round(rateFullyConfirmed ? interest : 0);
  const closingBalance = balanceAsOf(transactions, fyEndMs) + (rateFullyConfirmed ? roundedInterest : 0);

  return { interest: roundedInterest, closingBalance, rateFullyConfirmed, basedOnIncompleteHistory, trace };
}

/** Convenience wrapper for "show the rate used" — the rate that applied to the FY's first month
 *  (April), since a mid-year rate change would otherwise make "the FY's rate" an ambiguous single
 *  number. `null` under the same conditions `lookupRateForMonth` does. */
export function getPpfInterestRateForFy(rateTable: PpfRateTable, fyStartYear: number): number | null {
  return lookupRateForMonth(rateTable, `${fyStartYear}-04`);
}

/** Exported (not just used internally by `checkPpfInterestMismatch`) — the manual-entry calculation
 *  info banner (`PpfTransactionSheet`, apps/mobile) needs the exact same tolerance so its own
 *  matches-vs-mismatch comparison can never disagree with this file's own mismatch check. */
export const INTEREST_AMOUNT_TOLERANCE = 5; // whole-rupee statements, small rounding drift is expected

/** Whether an imported/recorded interest transaction agrees with a fresh recalculation for its FY.
 *  Mirrors EPF's `checkInterestMismatch` — the exact comparison a review screen or breakdown popup
 *  should use, factored out here so every caller agrees. Returns `null` only if no rate table is
 *  available at all (nothing to compare against — not itself a mismatch). */
export function checkPpfInterestMismatch(
  interestTxn: PpfTransaction,
  allTransactions: PpfTransaction[],
  rateTable: PpfRateTable,
  fyStartYear: number
): { recorded: number; calculated: number; mismatched: boolean; basedOnIncompleteHistory: boolean } | null {
  const otherTxns = allTransactions.filter((t) => t.id !== interestTxn.id);
  const result = calculatePpfInterestForFy(otherTxns, fyStartYear, rateTable);
  if (!result.rateFullyConfirmed) return null;
  return {
    recorded: interestTxn.amount,
    calculated: result.interest,
    mismatched: Math.abs(interestTxn.amount - result.interest) > INTEREST_AMOUNT_TOLERANCE,
    basedOnIncompleteHistory: result.basedOnIncompleteHistory
  };
}
