import type { AssetMeta, EpfEmployer, EpfTransaction } from '@/core/db/types';

export const EPF_RATE = 0.0825;
export const EPF_EMPLOYER_EPF_PCT = 0.0367;
export const EPS_PCT = 0.0833;
export const EPF_RETIREMENT_AGE = 58;

export interface EpfMonthEntry {
  month: string;
  fyLabel: string;
  fyStartYear: number;
  companyName: string;
  /** Which `EpfEmployer.id` this entry belongs to — added 2026-08-11 alongside the
   *  `epfComputeAllMonths` employer-scoping fix (see that function's own doc comment) so a
   *  per-employer ledger view can filter entries unambiguously, never just by `companyName`
   *  (two employers could share a name — memberId already exists for exactly this reason). */
  employerId: string;
  empAmount: number;
  eplrEpfAmount: number;
  epsAmount: number;
  proRata?: { workedDays: number; totalDays: number };
  /** `true` when this entry's amounts came from a real logged `EpfTransaction` (matched by
   *  `wagesMonth`), `false` when they're the formula-based estimate — see this file's header
   *  doc comment on `epfComputeAllMonths` for why the two must agree by construction. */
  isReal: boolean;
}

export interface EpfCardData {
  currentEmployer: EpfEmployer | null;
  monthlyEmployee: number;
  monthlyEmployerEpf: number;
  monthlyEps: number;
  monthlyTotalEpf: number;
  yearsToRetirement: number | null;
  projectedCorpus: number | null;
  totalComputedMonths: number;
  corpus: number;
  employeeTotal: number;
  employerTotal: number;
  /** EPS/pension total, summed from `epfComputeAllMonths`' blended real+estimate `epsAmount` —
   *  informational only, deliberately NOT added into `corpus` (EPS funds the separate,
   *  non-withdrawable pension scheme; see the "EPS goes to pension fund" caption elsewhere in the
   *  UI for the same convention). */
  pensionTotal: number;
  interestEarned: number;
}

export function epfCurrentEmployer(employers: EpfEmployer[]): EpfEmployer | null {
  return employers.find((e) => !e.toDate) ?? null;
}

/** Every employer whose `[fromDate, toDate]` range covers a given "YYYY-MM" wages month — plural,
 *  and deliberately not "the" employer, because a genuine mid-month job switch means TWO employers
 *  can legitimately both cover the same wages month (see `EpfTransaction.employerId`'s own doc
 *  comment). Consolidates what used to be three near-identical private copies of this date-range
 *  check (`epfExcelExport.ts`, `epfReviewFlags.ts`, and the one needed for the import
 *  reconciliation scoping fix in `epfImportLogic.ts`) into one shared source. */
export function epfEmployersCoveringMonth(employers: EpfEmployer[], wagesMonth: string): EpfEmployer[] {
  const [y = 0, m = 0] = wagesMonth.split('-').map(Number);
  const midMonthMs = new Date(y, (m || 1) - 1, 15).getTime();
  return employers.filter((e) => midMonthMs >= e.fromDate && midMonthMs <= (e.toDate ?? Infinity));
}

/** The SINGLE employer a wages month unambiguously belongs to — `null` both when no employer's
 *  range covers it AND when more than one does (a genuine switch month, or overlapping data) —
 *  never guesses which of two candidates is "more likely" right. Callers that need to resolve a
 *  switch month correctly should prefer a transaction's own `employerId` instead of this
 *  date-range fallback wherever one exists. */
export function epfEmployerForWagesMonth(employers: EpfEmployer[], wagesMonth: string): EpfEmployer | null {
  const covering = epfEmployersCoveringMonth(employers, wagesMonth);
  return covering.length === 1 ? (covering[0] ?? null) : null;
}

/** The SINGLE employer whose `[fromDate, toDate]` range covers a raw epoch-ms date — `null` both
 *  when no employer covers it and when more than one does (never guesses, same convention as
 *  `epfEmployerForWagesMonth`). Needed for interest/transfer_in/withdrawal/advance transactions,
 *  which have no `wagesMonth` of their own to resolve via. */
export function epfEmployerForDate(employers: EpfEmployer[], dateMs: number): EpfEmployer | null {
  const covering = employers.filter((e) => dateMs >= e.fromDate && dateMs <= (e.toDate ?? Infinity));
  return covering.length === 1 ? (covering[0] ?? null) : null;
}

/** Which employer a real transaction (of ANY type) actually belongs to — prefers its own
 *  `employerId` (unambiguous, stamped at import time for every import-created transaction type since
 *  2026-08-11 — see `epfImportLogic.ts`'s `buildImportedTxn`); falls back to `epfEmployerForWagesMonth`
 *  for a contribution written before that field existed, or `epfEmployerForDate`'s raw-date
 *  containment for anything else — both refuse to guess when more than one employer's range covers
 *  the relevant month/date. Shared by `epfComputeAllMonths`, `epfLastRealEvidenceMs`, and the
 *  reconciliation-scoping fix in `epfImportLogic.ts`'s `reconcileUnit` so they all agree on "who does
 *  this transaction belong to" by construction. */
export function epfResolveTxnEmployer(t: EpfTransaction, employers: EpfEmployer[]): EpfEmployer | null {
  if (t.employerId) return employers.find((e) => e.id === t.employerId) ?? null;
  if (t.type === 'contribution') return t.wagesMonth ? epfEmployerForWagesMonth(employers, t.wagesMonth) : null;
  return epfEmployerForDate(employers, t.date);
}

/** The latest real evidence Penny has for this employer — the later of (its latest real
 *  `contribution` transaction's wage month) and (the FY-end of its latest `confirmedFys` entry, since
 *  a confirmed contribution-free year, per §10.7, is still real EPFO data, not a gap). `null` means
 *  NO real evidence exists at all (e.g. a purely manually-added employer, never imported).
 *
 *  2026-08-11 addition — powers `epfComputeAllMonths`'s stale-projection cap (docs/plans/
 *  epf-passbook-import.md's follow-up round): an employer left "current" (no `toDate`) but not yet
 *  `currentEmploymentConfirmed` should never be projected with formula-estimated (or confirmed-zero)
 *  months past whatever real evidence actually exists — that's fabricating data, not estimating it.
 *  This must hold independently of whether the user ever answers the reactive "Are you still working
 *  at X?" nudge, which is advisory-only and was never itself a safety mechanism. */
export function epfLastRealEvidenceMs(
  employer: EpfEmployer,
  employers: EpfEmployer[],
  transactions: EpfTransaction[]
): number | null {
  let latestMs: number | null = null;
  for (const t of transactions) {
    if (t.type !== 'contribution' || !t.wagesMonth) continue;
    if (epfResolveTxnEmployer(t, employers)?.id !== employer.id) continue;
    const wageMonthMs = new Date(`${t.wagesMonth}-01T00:00:00`).getTime();
    if (latestMs === null || wageMonthMs > latestMs) latestMs = wageMonthMs;
  }
  const confirmedFys = employer.confirmedFys ?? [];
  if (confirmedFys.length > 0) {
    const confirmedFyEndMs = new Date(Math.max(...confirmedFys) + 1, 2, 31, 23, 59, 59, 999).getTime();
    if (latestMs === null || confirmedFyEndMs > latestMs) latestMs = confirmedFyEndMs;
  }
  return latestMs;
}

export function epfMonthsBetween(fromMs: number, toMs: number): number {
  const f = new Date(fromMs);
  const t = new Date(toMs);
  return Math.max(0, (t.getFullYear() - f.getFullYear()) * 12 + t.getMonth() - f.getMonth());
}

export function epfMonthLabel(ms: number): string {
  return new Date(ms).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

/** "YYYY-MM" for an epoch-ms date — the same granularity `EpfTransaction.wagesMonth` already uses.
 *  Needed anywhere a date (e.g. `EpfEmployer.fromDate`/`toDate`, exact to the day for pro-rata
 *  purposes) must be compared against a wage month WITHOUT the day component causing a false
 *  mismatch — e.g. a joining date of 15 May 2025 and a wagesMonth of "2025-05" are the SAME month,
 *  even though `fromDate` (a specific day) is numerically later than "2025-05-01". Comparing raw
 *  epoch ms directly for this purpose is a real bug class (see `checkJoiningDateContradiction`'s own
 *  2026-08-xx fix in `epfReviewFlags.ts`, apps/mobile). */
export function epfMonthKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function epfGetSalaryForMonth(emp: EpfEmployer, month: string): number {
  const hikes = emp.hikeTimeline;
  if (!hikes || hikes.length === 0) return emp.basicSalary;
  const monthMs = new Date(`${month}-01T00:00:00`).getTime();
  let salary = emp.basicSalary;
  for (const hike of hikes) {
    if (hike.fromDate <= monthMs) salary = hike.basicSalary;
    else break;
  }
  return salary;
}

export interface EpfWageDiscrepancy {
  direction: 'higher' | 'lower';
  realAmount: number;
  predictedAmount: number;
}

/** Relative, not a flat rupee amount — avoids flagging every month over ordinary rounding noise
 *  (see docs/plans/epf-passbook-import.md §10.6). */
const WAGE_DISCREPANCY_RELATIVE_TOLERANCE = 0.02;

/** Whether a REAL logged contribution's employee amount disagrees with what the employer's CURRENT
 *  salary model (`epfGetSalaryForMonth` × `employeeContribPct`) would predict for that wage month —
 *  beyond a small relative tolerance. Powers the EPF "needs review" flags (row badges + card-level
 *  count) in `apps/mobile`'s `epfReviewFlags.ts` — kept here rather than there because it's pure
 *  calculation with no React/UI dependency, consistent with this file's existing architecture.
 *  Returns `null` when there's nothing to flag: amounts already agree, or there's no positive
 *  predicted amount to compare against (e.g. a brand-new employer with a zero basic salary). */
export function epfCheckWageDiscrepancy(
  employer: EpfEmployer,
  wagesMonth: string,
  realEmployeeAmount: number
): EpfWageDiscrepancy | null {
  const predictedAmount = epfGetSalaryForMonth(employer, wagesMonth) * (employer.employeeContribPct / 100);
  if (predictedAmount <= 0) return null;
  const relDiff = (realEmployeeAmount - predictedAmount) / predictedAmount;
  if (Math.abs(relDiff) <= WAGE_DISCREPANCY_RELATIVE_TOLERANCE) return null;
  return { direction: relDiff > 0 ? 'higher' : 'lower', realAmount: realEmployeeAmount, predictedAmount };
}

export function epfLatestSalary(emp: EpfEmployer): number {
  const sorted = [...(emp.hikeTimeline ?? [])].sort((a, b) => b.fromDate - a.fromDate);
  return sorted[0]?.basicSalary ?? emp.basicSalary;
}

export function epfMonthToFy(month: string): { label: string; startYear: number } {
  const [y = 0, m = 0] = month.split('-').map(Number);
  const s = m >= 4 ? y : y - 1;
  return { label: `FY ${s}-${String(s + 1).slice(2)}`, startYear: s };
}

/** Generates one estimated (or, where a real logged contribution exists for that wage month, REAL)
 *  `EpfMonthEntry` per calendar month across each employer's `[fromDate, toDate ?? now]` range.
 *
 *  `transactions` is matched against by `wagesMonth` — for any month with a real `contribution`
 *  transaction, that transaction's own `employeeAmount`/`employerAmount`/`pensionAmount` are used
 *  verbatim instead of the `basicSalary`/`employeeContribPct`/hike-timeline formula estimate. This
 *  makes this function the SINGLE source of truth for "what did/should this month contribute",
 *  blending real data where it exists and falling back to the estimate everywhere else — callers
 *  (the card's totals, the all-transactions list) no longer need their own separate real-vs-estimate
 *  gating, and so can never disagree with each other by construction.
 *
 *  2026-08-11 fix — a real transaction is now matched to a month PER EMPLOYER
 *  (`epfResolveTxnEmployer`), not by `wagesMonth` alone across the whole holding. Before this fix, a
 *  genuine mid-month employer switch (two employers both left "current" with no `toDate` —
 *  see `createEmployerFromUnit`'s own fix in `epfImportLogic.ts`) meant a real transaction
 *  belonging to the NEW employer's wage month also got displayed under the OLD employer's
 *  identical wage month, since the lookup had no way to tell them apart. Also caps an unconfirmed
 *  "current" employer's projection at its own last real evidence (`epfLastRealEvidenceMs`) rather
 *  than fabricating months all the way to today — see that function's own doc comment. */
export function epfComputeAllMonths(employers: EpfEmployer[], transactions: EpfTransaction[] = []): EpfMonthEntry[] {
  const realByEmployerMonth = new Map<string, EpfTransaction>(); // key: `${employerId}|${wagesMonth}`
  for (const t of transactions) {
    if (t.type !== 'contribution' || !t.wagesMonth) continue;
    const owner = epfResolveTxnEmployer(t, employers);
    if (!owner) continue; // ambiguous or unresolvable (legacy data, genuine overlap) — never guess
    realByEmployerMonth.set(`${owner.id}|${t.wagesMonth}`, t);
  }

  const entries: EpfMonthEntry[] = [];
  const now = new Date();
  for (const emp of employers) {
    const from = new Date(emp.fromDate);
    const to = emp.toDate
      ? new Date(emp.toDate)
      : emp.currentEmploymentConfirmed
        ? now
        : new Date(Math.min(now.getTime(), epfLastRealEvidenceMs(emp, employers, transactions) ?? now.getTime()));
    let y = from.getFullYear();
    let mo = from.getMonth() + 1;
    const toY = to.getFullYear();
    const toMo = to.getMonth() + 1;
    while (y < toY || (y === toY && mo <= toMo)) {
      const month = `${y}-${String(mo).padStart(2, '0')}`;
      const fy = epfMonthToFy(month);
      const daysInMonth = new Date(y, mo, 0).getDate();
      const isFirstMonth = y === from.getFullYear() && mo === from.getMonth() + 1;
      const isLastMonth = y === toY && mo === toMo;
      let workedDays = daysInMonth;
      if (isFirstMonth && from.getDate() > 1) workedDays = daysInMonth - (from.getDate() - 1);
      if (isLastMonth && to.getDate() < daysInMonth) workedDays = Math.min(workedDays, to.getDate());
      const fraction = workedDays / daysInMonth;
      const isPartial = workedDays < daysInMonth;
      const realTxn = realByEmployerMonth.get(`${emp.id}|${month}`);
      // A month with no real transaction inside a CONFIRMED financial year (a real passbook/export
      // was imported covering it, even if it had zero contribution rows — e.g. after leaving
      // mid-way through a prior year) is a confirmed real zero, never a guess — found via
      // real-device testing importing an ex-employer's later, contribution-free years. Only an
      // UNCONFIRMED month (no import ever covered it) falls back to the formula estimate.
      const isConfirmedFy = (emp.confirmedFys ?? []).includes(fy.startYear);
      const useEstimate = !realTxn && !isConfirmedFy;
      entries.push({
        month,
        fyLabel: fy.label,
        fyStartYear: fy.startYear,
        companyName: emp.companyName,
        employerId: emp.id,
        empAmount: realTxn
          ? (realTxn.employeeAmount ?? 0)
          : useEstimate
            ? Math.round(epfGetSalaryForMonth(emp, month) * (emp.employeeContribPct / 100) * fraction)
            : 0,
        eplrEpfAmount: realTxn
          ? (realTxn.employerAmount ?? 0)
          : useEstimate
            ? Math.round(epfGetSalaryForMonth(emp, month) * EPF_EMPLOYER_EPF_PCT * fraction)
            : 0,
        epsAmount: realTxn
          ? (realTxn.pensionAmount ?? 0)
          : useEstimate
            ? Math.round(epfGetSalaryForMonth(emp, month) * EPS_PCT * fraction)
            : 0,
        isReal: !!realTxn || isConfirmedFy,
        ...(isPartial && useEstimate && { proRata: { workedDays, totalDays: daysInMonth } })
      });
      mo++;
      if (mo > 12) {
        mo = 1;
        y++;
      }
    }
  }
  return entries.sort((a, b) => b.month.localeCompare(a.month));
}

export function epfBuildCardData(meta: AssetMeta): EpfCardData {
  const now = Date.now();
  const employers = meta.epfEmployers ?? [];
  const txns = meta.epfTransactions ?? [];
  const currentEmp = epfCurrentEmployer(employers);
  const basic = currentEmp ? epfLatestSalary(currentEmp) : 0;
  const empPct = (currentEmp?.employeeContribPct ?? 12) / 100;

  const monthlyEmployee = Math.round(basic * empPct);
  const monthlyEmployerEpf = Math.round(basic * EPF_EMPLOYER_EPF_PCT);
  const monthlyEps = Math.round(basic * EPS_PCT);
  const monthlyTotalEpf = monthlyEmployee + monthlyEmployerEpf;

  // Contribution-derived totals (employee/employer/pension) always flow through
  // `epfComputeAllMonths`, never summed from `txns` directly — that function is now the single
  // source of truth blending real logged contributions with the formula estimate per month, so the
  // card's totals and the all-transactions list (which also calls it) can never disagree. Interest
  // and the transfer_in/withdrawal/advance corpus adjustments below aren't month-indexed and stay
  // summed straight from the real transactions, unchanged.
  let interestEarned = 0;
  let corpus = 0;
  for (const t of txns) {
    if (t.type === 'interest') {
      interestEarned += t.amount ?? 0;
      corpus += t.amount ?? 0;
    } else if (t.type === 'transfer_in') {
      corpus += t.amount ?? 0;
    } else if (t.type === 'withdrawal' || t.type === 'advance') {
      corpus -= t.amount ?? 0;
    }
  }

  let employeeTotal = 0;
  let employerTotal = 0;
  let pensionTotal = 0;
  const allMonths = epfComputeAllMonths(employers, txns);
  for (const m of allMonths) {
    employeeTotal += m.empAmount;
    employerTotal += m.eplrEpfAmount;
    pensionTotal += m.epsAmount;
    corpus += m.empAmount + m.eplrEpfAmount;
  }
  corpus = Math.max(0, corpus);

  let yearsToRetirement: number | null = null;
  let projectedCorpus: number | null = null;
  if (meta.epfBirthYear) {
    const age = new Date(now).getFullYear() - meta.epfBirthYear;
    const yrs = EPF_RETIREMENT_AGE - age;
    if (yrs > 0) {
      yearsToRetirement = yrs;
      const r = EPF_RATE / 12;
      const n = yrs * 12;
      projectedCorpus = corpus * Math.pow(1 + r, n) + (monthlyTotalEpf * (Math.pow(1 + r, n) - 1)) / r;
    }
  }

  const totalComputedMonths = employers.reduce(
    (sum, emp) => sum + epfMonthsBetween(emp.fromDate, emp.toDate ?? now),
    0
  );
  return {
    currentEmployer: currentEmp,
    monthlyEmployee,
    monthlyEmployerEpf,
    monthlyEps,
    monthlyTotalEpf,
    yearsToRetirement,
    projectedCorpus,
    totalComputedMonths,
    corpus,
    employeeTotal,
    employerTotal,
    pensionTotal,
    interestEarned
  };
}

// ─── Pro-rata joining/leaving date estimation (2026-08-11 follow-up round) ───────────────────

/** Number of calendar days in a "YYYY-MM" wage month — factored out of `epfComputeAllMonths`'s own
 *  inline `new Date(y, mo, 0).getDate()` so `describeNewEmployerSetup`/`estimateProRataEdgeDate`
 *  callers (`epfImportLogic.ts`) don't duplicate the formula. */
export function epfDaysInMonth(wagesMonth: string): number {
  const [y = 0, m = 0] = wagesMonth.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Inverts a pro-rata calculation to SUGGEST which day within a month a partial contribution
 *  implies — e.g. "the passbook shows ₹124 for a month whose full-salary contribution would be
 *  ₹1,278; that's about 18 of 31 days." Always just a prefill for a date picker, never trusted as
 *  the real value (see docs/plans/epf-passbook-import.md's 2026-08-11 follow-up round — "always
 *  confirm a new employer's real joining date," never silently infer one).
 *
 *  `edge: 'start'` means the partial amount covers days FROM the returned day THROUGH month-end (a
 *  joining month); `'end'` means it covers days FROM the 1st THROUGH the returned day (a leaving
 *  month). Falls back to the "no partial month" default (day 1 for `'start'`, the month's last day
 *  for `'end'`) whenever there's nothing to invert — no full-month reference (`fullAmount <= 0`) or
 *  the partial amount already looks like a full month (`partialAmount >= fullAmount`). */
export function estimateProRataEdgeDate(
  daysInMonth: number,
  partialAmount: number,
  fullAmount: number,
  edge: 'start' | 'end'
): number {
  if (fullAmount <= 0 || partialAmount >= fullAmount) return edge === 'start' ? 1 : daysInMonth;
  const impliedWorkedDays = Math.max(1, Math.min(daysInMonth, Math.round((partialAmount / fullAmount) * daysInMonth)));
  return edge === 'start' ? daysInMonth - impliedWorkedDays + 1 : impliedWorkedDays;
}

export interface EpfProRataConsistency {
  impliedWorkedDays: number;
  totalDays: number;
  impliedAmount: number;
  actualAmount: number;
  /** `true` when the actual amount is within a small rounding tolerance of what the chosen day
   *  implies — informational only, never blocks anything (same "always reviewable, never silently
   *  enforced" principle as every other check in this feature). */
  consistent: boolean;
}

/** Rupees — real contributions round to the nearest rupee already, so anything beyond this is a
 *  genuine inconsistency worth a quiet note, not rounding noise. */
const PRO_RATA_TOLERANCE = 5;

/** Checks whether a CHOSEN edge day (from a date picker, whether `estimateProRataEdgeDate`'s own
 *  suggestion or a manual override) is consistent with a partial month's real contribution amount —
 *  surfaced as an inline note in the new-employer-setup sheet, and reused by
 *  `epfReviewFlags.ts`'s `joiningDateContradiction` flag for a later import that reveals a
 *  mismatch against an already-confirmed date. Never blocks anything. */
export function checkProRataConsistency(
  chosenDay: number,
  daysInMonth: number,
  actualAmount: number,
  fullAmount: number,
  edge: 'start' | 'end'
): EpfProRataConsistency {
  const impliedWorkedDays = edge === 'start' ? daysInMonth - chosenDay + 1 : chosenDay;
  const impliedAmount = Math.round(fullAmount * (impliedWorkedDays / daysInMonth));
  return {
    impliedWorkedDays,
    totalDays: daysInMonth,
    impliedAmount,
    actualAmount,
    consistent: Math.abs(impliedAmount - actualAmount) <= PRO_RATA_TOLERANCE
  };
}

// ─── Estimated Gross Salary / CTC (2026-08-11 follow-up round) ──────────────────────────────

/** Default "Basic as % of Gross" used when `EpfEmployer.basicToGrossPct` is unset — matches the
 *  common ~40-50% Indian payroll convention, and the Nov-2025 labour-code change that set a 50%
 *  statutory floor (see docs/plans/epf-passbook-import.md's 2026-08-11 follow-up round for sources
 *  checked). Always just a labelled estimate, never asserted as fact — Penny has no way to know a
 *  real Gross/CTC split from EPF data alone; `basicToGrossPct` exists precisely so a user who DOES
 *  know their real ratio can override this default. */
export const EPF_DEFAULT_BASIC_TO_GROSS_PCT = 50;

/** Annual gratuity accrual rate under the Payment of Gratuity Act, 1972 — 15 days' wages per
 *  completed year of service, out of a 26-day working month (Basic × 15/26 per year). */
const GRATUITY_DAYS_PER_YEAR = 15;
const GRATUITY_WORKING_DAYS_PER_MONTH = 26;

export interface EpfGrossCtcEstimate {
  basicSalary: number;
  basicToGrossPct: number;
  /** Monthly — CTC/Gross are conventionally QUOTED annually in India (e.g. "12 LPA"), but the
   *  underlying monthly figures are kept too since they feed `estimatedCtc`'s own breakdown and
   *  `netMonthly`'s calculation. */
  estimatedGross: number;
  monthlyEmployeeContribution: number;
  monthlyEmployerEpf: number;
  monthlyEps: number;
  monthlyGratuityAccrual: number;
  estimatedCtc: number;
  /** Gross − the employee's own EPF deduction — a rough take-home figure, deliberately NOT also
   *  subtracting income tax (this app has no payroll tax engine) — always the more conservative
   *  (higher) side of "what actually lands in the bank," clearly still just an estimate. */
  netMonthly: number;
  annualGross: number;
  annualCtc: number;
}

/** Estimates Gross Salary and CTC from an employer's `basicSalary` — see this section's header
 *  comment for why these are estimates, never exact figures. `monthlyEmployeeContribution`/
 *  `monthlyEmployerEpf`/`monthlyEps` are the SAME figures already shown elsewhere on the card
 *  (`EpfCardData`'s own fields) — passed in rather than recomputed, so the two displays can never
 *  disagree. */
export function estimateGrossAndCtc(
  basicSalary: number,
  monthlyEmployeeContribution: number,
  monthlyEmployerEpf: number,
  monthlyEps: number,
  basicToGrossPct: number = EPF_DEFAULT_BASIC_TO_GROSS_PCT
): EpfGrossCtcEstimate {
  const pct = basicToGrossPct > 0 ? basicToGrossPct : EPF_DEFAULT_BASIC_TO_GROSS_PCT;
  const estimatedGross = Math.round(basicSalary / (pct / 100));
  const monthlyGratuityAccrual = Math.round(
    (basicSalary * GRATUITY_DAYS_PER_YEAR) / GRATUITY_WORKING_DAYS_PER_MONTH / 12
  );
  const estimatedCtc = estimatedGross + monthlyEmployerEpf + monthlyEps + monthlyGratuityAccrual;
  const netMonthly = Math.max(0, estimatedGross - monthlyEmployeeContribution);
  return {
    basicSalary,
    basicToGrossPct: pct,
    estimatedGross,
    monthlyEmployeeContribution,
    monthlyEmployerEpf,
    monthlyEps,
    monthlyGratuityAccrual,
    estimatedCtc,
    netMonthly,
    annualGross: estimatedGross * 12,
    annualCtc: estimatedCtc * 12
  };
}

// ─── Hike journey (2026-08-xx, approved via docs/mockups/proposals/epf-hike-journey-v1.html) ──

export interface EpfHikeJourneyPoint {
  date: number;
  basicSalary: number;
  /** `true` for the synthesized starting point (`emp.fromDate`/`emp.basicSalary`) — not a real
   *  `EpfSalaryHike` entry, but the journey's own first data point. */
  isJoined: boolean;
  /** `null` for the very first point (nothing before it to compare against). */
  growthPct: number | null;
}

/** Every salary point in an employer's history — the joining basic plus every real hike, each
 *  carrying its own growth % vs. the point immediately before it. Powers `RetirementCard.tsx`'s
 *  hike-journey cards (Basic + the same Gross/CTC/Net-monthly breakdown already shown at the ledger
 *  header, not just Basic alone) — returned newest-first, matching the card's own existing
 *  hike-list sort. Kept here (not inline in the component) purely so it's unit-testable — apps/mobile
 *  has no test runner of its own. */
export function buildEpfHikeJourney(emp: EpfEmployer): EpfHikeJourneyPoint[] {
  const ascending = [
    { date: emp.fromDate, basicSalary: emp.basicSalary, isJoined: true },
    ...[...(emp.hikeTimeline ?? [])]
      .sort((a, b) => a.fromDate - b.fromDate)
      .map((h) => ({ date: h.fromDate, basicSalary: h.basicSalary, isJoined: false }))
  ];
  const withGrowth: EpfHikeJourneyPoint[] = ascending.map((point, i) => {
    const prev = ascending[i - 1];
    const growthPct =
      prev && prev.basicSalary > 0 ? ((point.basicSalary - prev.basicSalary) / prev.basicSalary) * 100 : null;
    return { ...point, growthPct };
  });
  return [...withGrowth].reverse();
}
