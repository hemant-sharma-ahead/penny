// EPF annual interest calculator (2026-08-07) — see docs/plans/epf-passbook-import.md §6. Serves
// TWO callers: the manual "Want me to calculate it for you?" flow in EpfTransactionSheet (for users
// who never import a passbook PDF), and the PDF-import reconciliation flow (comparing EPFO's actual
// credited figure against a recomputation, as a sanity check). One implementation, two callers —
// not two separate calculators.
import type { EpfEmployer, EpfTransaction } from '@/core/db/types';
import { epfComputeAllMonths, epfResolveTxnEmployer } from './epfCalculations';
import { lookupRateForMonth, type EpfRateTable } from './epfInterestRates';

/** The accrual rule, explicit and user-verified against a real passbook (see the design doc's §6.1
 *  — reproduced ₹39/₹12 exactly against a real FY2014-15 passbook's credited interest, and its
 *  ₹3,725/₹1,139 closing balances):
 *
 *  A contribution made for salary month M does NOT earn interest in that same month. Employers
 *  typically deduct the contribution for month M from salary but deposit it with EPFO by the 15th
 *  of month M+1. Interest is calculated on each month's OPENING balance — a deposit made in month
 *  M+1 is not part of that month's opening balance (it's a same-month inflow), so it earns ZERO
 *  interest for month M+1, and only starts earning interest from month M+2 onward. Since Penny
 *  models a contribution by its `wagesMonth` (the salary month, "M"), the deposit month is M+1 —
 *  matching the real passbook's own transaction dates, which are one month after the wage month in
 *  every sample checked.
 *
 *  Implemented as a genuine month-by-month simulation across the financial year (April→March), NOT
 *  a closed-form "amount × remaining months" shortcut — a shortcut only holds when the rate is
 *  constant for the whole year, and would need special-casing for the one historical mid-year rate
 *  change (2000-01). Simulating month-by-month makes a rate change "fall out for free": each
 *  month's own rate is looked up independently, so two different rates applying to different
 *  months within the same FY needs no special logic at all.
 *
 *  Interest is summed across all 12 months and credited as ONE lump figure at FY-end — it is never
 *  compounded mid-year, matching real EPFO behavior (a fresh contribution never earns "interest on
 *  interest" within the same year it was credited). The employee and employer-EPF balances are
 *  simulated INDEPENDENTLY (separate running balances, separate resulting interest); the
 *  pension/EPS balance never earns interest and is excluded entirely, not just computed as 0.
 */

export interface EpfInterestCalculationInput {
  /** "YYYY" — the financial year's START year, e.g. 2024 for FY2024-25 (matches
   *  `epfMonthToFy()`'s `startYear`). */
  fyStartYear: number;
  /** The employer's own monthly contributions for this FY (and enough of the prior FY to know the
   *  opening balance) — see `buildEpfInterestInput` for how this is normally assembled from either
   *  real logged transactions or the existing auto-estimate. */
  monthlyContributions: { month: string; employeeAmount: number; employerAmount: number }[];
  /** Real withdrawals (full settlement or partial "advance") DURING this FY — see `buildEpfInterestInput`.
   *  Applied the same way a deposit is: added/subtracted to the balance at month-END, after that
   *  month's own interest is computed — the withdrawal-side mirror of this file's existing "a deposit
   *  doesn't count until the month after" rule. A withdrawal taken mid-month still earns THAT month's
   *  own interest on the pre-withdrawal (opening) balance; only the FOLLOWING month's opening balance
   *  reflects the reduction. Real bug this fixes (2026-08-xx): before this field existed, a mid-year
   *  withdrawal was invisible to the interest simulation entirely — the balance kept growing every
   *  month for the rest of the FY as if the withdrawal never happened, producing a recalculated
   *  interest figure that disagreed with the real passbook's own (correct) recorded amount. */
  monthlyWithdrawals?: { month: string; employeeAmount: number; employerAmount: number }[];
  /** The balance immediately before this FY started (i.e. the prior FY's closing balance) — 0 for
   *  a brand-new EPF account with no prior history. */
  openingEmployeeBalance: number;
  openingEmployerBalance: number;
}

/** One month's contribution to a stream's total interest — exists purely for display (the doc's
 *  §10.5 "show the calculation" ask), never persisted. Amounts aren't rounded here; the caller
 *  rounds for display the same way the final totals are rounded. */
export interface EpfInterestMonthTrace {
  /** "YYYY-MM" */
  month: string;
  /** This month's balance BEFORE this FY's interest is added and before this month's own deposit —
   *  the figure interest is actually calculated on, per this file's accrual rule. */
  openingBalance: number;
  /** The month's own rate, as a percentage (e.g. 8.25) — `null` if not yet confirmed, matching
   *  `lookupRateForMonth`'s own contract. */
  ratePct: number | null;
  /** This month's interest contribution — always 0 when `ratePct` is `null`, never a guess. */
  interest: number;
}

export interface EpfInterestCalculationResult {
  employeeInterest: number;
  employerInterest: number;
  /** Closing balances AFTER this FY's interest is credited — i.e. what should become next FY's
   *  opening balance, and (for reconciliation) what should match the passbook's own `Closing
   *  Balance as on` row. */
  closingEmployeeBalance: number;
  closingEmployerBalance: number;
  /** False if any month in the FY had no confirmed rate available (see `lookupRateForMonth`) — the
   *  caller should surface "rate not yet available for FY X" rather than trust a partial/zero
   *  result silently computed against a gap in the rate table. */
  rateFullyConfirmed: boolean;
  /** Month-by-month detail behind `employeeInterest`/`employerInterest` — see §10.5. Always
   *  populated (cheap to compute, already a byproduct of the simulation); a caller that only wants
   *  the totals can simply ignore it. */
  employeeTrace: EpfInterestMonthTrace[];
  employerTrace: EpfInterestMonthTrace[];
}

const FY_MONTH_OFFSETS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2]; // Apr(3)..Mar(2), 0-indexed calendar months

/** All 12 "YYYY-MM" calendar months of the financial year starting in April of `fyStartYear`. */
function fyMonths(fyStartYear: number): string[] {
  return FY_MONTH_OFFSETS.map((monthIndex0, i) => {
    const year = fyStartYear + (i < 9 ? 0 : 1); // Apr-Dec stay in fyStartYear; Jan-Mar roll to +1
    return `${year}-${String(monthIndex0 + 1).padStart(2, '0')}`;
  });
}

/** Runs the §6.1 accrual simulation for one balance stream (employee OR employer-EPF — call this
 *  twice, independently, per `EpfInterestCalculationInput`'s doc comment). Returns the interest
 *  accrued and the closing balance, or `null` interest if any month's rate wasn't confirmed.
 *  `flowByMonth` is a NET figure — positive for a deposit, negative for a withdrawal (see
 *  `calculateEpfInterestForYear`, which merges both into one map before calling this) — so a
 *  withdrawal reduces the balance the exact same way, and at the exact same point in the loop
 *  (month-end, after that month's own interest is already computed), that a deposit adds to it.
 *  Clamped at 0 — EPFO's real balance never goes negative, and a full/near-full withdrawal's own
 *  rounding shouldn't be able to manufacture a nonsensical negative-balance "interest" figure in a
 *  later month. */
function simulateOneStream(
  months: string[],
  openingBalance: number,
  flowByMonth: Map<string, number>,
  rateTable: EpfRateTable
): { interest: number | null; closingBalance: number; trace: EpfInterestMonthTrace[] } {
  let balance = openingBalance;
  let interest = 0;
  let rateFullyConfirmed = true;
  const trace: EpfInterestMonthTrace[] = [];

  for (const month of months) {
    const ratePct = lookupRateForMonth(rateTable, month);
    const monthOpeningBalance = balance;
    let monthInterest = 0;
    if (ratePct === null) rateFullyConfirmed = false;
    else {
      monthInterest = balance * (ratePct / 12 / 100);
      interest += monthInterest;
    }
    trace.push({ month, openingBalance: monthOpeningBalance, ratePct, interest: monthInterest });
    balance = Math.max(0, balance + (flowByMonth.get(month) ?? 0));
  }

  return {
    interest: rateFullyConfirmed ? interest : null,
    closingBalance: balance + (rateFullyConfirmed ? interest : 0),
    trace
  };
}

/** Simulates one financial year's EPF interest accrual — see this file's header doc comment for the
 *  full accrual rule and its verification against a real passbook. Rounds interest to the nearest
 *  rupee only in the final result (matching how a real passbook displays it), not per-month. */
export function calculateEpfInterestForYear(
  input: EpfInterestCalculationInput,
  rateTable: EpfRateTable
): EpfInterestCalculationResult {
  const months = fyMonths(input.fyStartYear);

  const empFlow = new Map(input.monthlyContributions.map((c) => [c.month, c.employeeAmount]));
  const erFlow = new Map(input.monthlyContributions.map((c) => [c.month, c.employerAmount]));
  for (const w of input.monthlyWithdrawals ?? []) {
    empFlow.set(w.month, (empFlow.get(w.month) ?? 0) - w.employeeAmount);
    erFlow.set(w.month, (erFlow.get(w.month) ?? 0) - w.employerAmount);
  }

  const emp = simulateOneStream(months, input.openingEmployeeBalance, empFlow, rateTable);
  const er = simulateOneStream(months, input.openingEmployerBalance, erFlow, rateTable);

  const rateFullyConfirmed = emp.interest !== null && er.interest !== null;

  return {
    employeeInterest: Math.round(emp.interest ?? 0),
    employerInterest: Math.round(er.interest ?? 0),
    closingEmployeeBalance: Math.round(emp.closingBalance),
    closingEmployerBalance: Math.round(er.closingBalance),
    rateFullyConfirmed,
    employeeTrace: emp.trace,
    employerTrace: er.trace
  };
}

/** Convenience wrapper for §10.5's "show the rate used" — the rate that applied to a financial
 *  year's FIRST month (April), since a mid-year rate change would otherwise make "the FY's rate" an
 *  ambiguous single number. Returns `null` under the same conditions `lookupRateForMonth` does
 *  (before the table's first period, or the FY hasn't been confirmed yet) — never a guess. */
export function getInterestRateForFy(rateTable: EpfRateTable, fyStartYear: number): number | null {
  return lookupRateForMonth(rateTable, `${fyStartYear}-04`);
}

/** "YYYY-MM" for the calendar month one after `month` — the deposit month, per this file's accrual
 *  rule, for a contribution whose salary/wage month is `month`. */
function nextMonth(month: string): string {
  const [y = 0, m = 0] = month.split('-').map(Number);
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  return `${nextY}-${String(nextM).padStart(2, '0')}`;
}

/** Which financial year (start year) a given "YYYY-MM" DEPOSIT month falls inside — April through
 *  December belong to the FY starting that same calendar year; January through March belong to the
 *  FY that started the PREVIOUS calendar year. Deliberately separate from `epfMonthToFy` (which
 *  answers the same question for a WAGE month, semantically different data even though the
 *  underlying date math is identical) — named distinctly so a future edit to one doesn't
 *  accidentally get applied to the other's call sites. */
function depositMonthFyStartYear(depositMonth: string): number {
  const [y = 0, m = 0] = depositMonth.split('-').map(Number);
  return m >= 4 ? y : y - 1;
}

/** Assembles `calculateEpfInterestForYear`'s input from whatever contribution data already exists
 *  for one employer/FY — REAL logged `EpfTransaction`s if present, or the existing auto-estimated
 *  monthly figures (`epfComputeAllMonths()`) if the user has never logged anything for this
 *  employer at all. Works identically either way, per the design doc's explicit requirement — no
 *  separate code path for "has real data" vs. "estimate only".
 *
 *  `monthlyContributions[].month` here is the DEPOSIT month (when the balance simulation should
 *  treat it as a same-month inflow, per this file's accrual rule), not the wage/salary month a
 *  transaction is recorded against — the two differ by one month, which also means a WAGE month's
 *  own FY is not always the right FY to filter by: a March wage-month contribution deposits in
 *  April, the START of the NEXT financial year, so filtering candidate rows by the wage month's own
 *  FY (`epfMonthToFy`) would wrongly exclude it from the FY its deposit actually lands in (and
 *  wrongly include a wage-month-April-of-next-FY row that hasn't deposited yet). Filtering is done
 *  by `depositMonthFyStartYear()` on the computed deposit month instead, for exactly this reason.
 *
 *  For a real logged transaction, the deposit month is derived from its own `date` field (the
 *  actual parsed/entered deposit date — never re-inferred, per the design doc's "don't infer, use
 *  the real value" principle); for a pure estimate (no real transactions logged at all), there IS
 *  no real deposit date to use, so it falls back to wage-month-plus-one, matching every real
 *  passbook sample checked during this feature's design.
 *
 *  The real-vs-estimate choice is made PER CALL (i.e. per financial year), not once per employer —
 *  this function always computes exactly one FY, so a user with real transactions starting only in
 *  a recent year still gets a reasonable estimate for an earlier year they never logged, rather
 *  than an empty/zero result for that earlier year just because *some* later year has real data.
 *
 *  `priorClosingBalance` should come from the previous FY's own calculation result (or an
 *  `EpfBalanceCheckpoint`, if one exists from an import) — 0 for a brand-new account with no prior
 *  year.
 *
 *  2026-08-xx fix — `realDeposits` is now scoped to THIS employer via `epfResolveTxnEmployer`, using
 *  the full `employers` list. Real reported bug, found via on-device testing: a same-FY employer
 *  switch means BOTH employers can have real contribution transactions in the same financial year
 *  (deposit-month FY, not wage-month FY) — before this fix, `realDeposits` filtered the WHOLE
 *  holding's transactions by type+FY only, with no employer check at all, so calculating Company A's
 *  interest for the FY it switched in silently picked up Company B's real deposits too (visibly:
 *  Company A's "opening balance" kept growing every month in the interest breakdown popup, well past
 *  the month Company A's own contributions actually stopped, inflating the recomputed interest and
 *  making it disagree with the passbook's own real recorded figure). The `employers` param is
 *  REQUIRED (not optional) specifically so a caller can't accidentally skip this scoping — every real
 *  call site already has the full employer list in scope regardless (`computeEpfInterestOnDemand`
 *  already resolved `employer` from it via `pickEmployerForFy`).
 *
 *  2026-08-xx fix — also collects real `withdrawal`/`advance` transactions DURING this FY, scoped the
 *  same way, into `monthlyWithdrawals`. A withdrawal's own date is used directly (no "deposit month"
 *  offset — that concept is specific to a contribution's employer-deposits-it-later timing, a
 *  withdrawal takes effect on its own real date). A withdrawal that predates this FY is already
 *  correctly reflected in `priorClosingBalance` (via `sumEpfBalanceBeforeFy`, apps/mobile) — only
 *  same-FY withdrawals need to be simulated here. Real bug this fixes: a mid-year withdrawal (e.g. a
 *  full/partial settlement) was previously invisible to the interest simulation entirely — the
 *  balance kept growing every remaining month of the FY as if the withdrawal never happened, so
 *  Penny's recalculated interest disagreed with the real, correct passbook figure. Uses the same
 *  `employeeAmount ?? amount` / `employerAmount ?? 0` read convention `sumEpfBalanceBeforeFy` already
 *  uses for a withdrawal transaction, for consistency. */
export function buildEpfInterestInput(
  employer: EpfEmployer,
  employers: EpfEmployer[],
  transactions: EpfTransaction[],
  fyStartYear: number,
  priorClosingBalance: { employee: number; employer: number }
): EpfInterestCalculationInput {
  const employerScoped = (t: EpfTransaction) => epfResolveTxnEmployer(t, employers)?.id === employer.id;

  const realDeposits = transactions
    .filter((t): t is EpfTransaction & { wagesMonth: string } => t.type === 'contribution' && !!t.wagesMonth)
    .filter(employerScoped)
    .map((t) => {
      const d = new Date(t.date);
      const depositMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return { month: depositMonth, employeeAmount: t.employeeAmount ?? 0, employerAmount: t.employerAmount ?? 0 };
    })
    .filter((c) => depositMonthFyStartYear(c.month) === fyStartYear);

  const monthlyContributions =
    realDeposits.length > 0
      ? realDeposits
      : epfComputeAllMonths([employer], transactions)
          .map((m) => ({ month: nextMonth(m.month), employeeAmount: m.empAmount, employerAmount: m.eplrEpfAmount }))
          .filter((c) => depositMonthFyStartYear(c.month) === fyStartYear);

  const monthlyWithdrawals = transactions
    .filter((t) => t.type === 'withdrawal' || t.type === 'advance')
    .filter(employerScoped)
    .map((t) => {
      const d = new Date(t.date);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return { month, employeeAmount: t.employeeAmount ?? t.amount ?? 0, employerAmount: t.employerAmount ?? 0 };
    })
    .filter((w) => depositMonthFyStartYear(w.month) === fyStartYear);

  return {
    fyStartYear,
    monthlyContributions,
    monthlyWithdrawals,
    openingEmployeeBalance: priorClosingBalance.employee,
    openingEmployerBalance: priorClosingBalance.employer
  };
}
