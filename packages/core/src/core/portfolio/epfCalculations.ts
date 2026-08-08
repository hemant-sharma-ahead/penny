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

export function epfMonthsBetween(fromMs: number, toMs: number): number {
  const f = new Date(fromMs);
  const t = new Date(toMs);
  return Math.max(0, (t.getFullYear() - f.getFullYear()) * 12 + t.getMonth() - f.getMonth());
}

export function epfMonthLabel(ms: number): string {
  return new Date(ms).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
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
 *  gating, and so can never disagree with each other by construction. */
export function epfComputeAllMonths(employers: EpfEmployer[], transactions: EpfTransaction[] = []): EpfMonthEntry[] {
  const realByMonth = new Map<string, EpfTransaction>();
  for (const t of transactions) {
    if (t.type === 'contribution' && t.wagesMonth) realByMonth.set(t.wagesMonth, t);
  }

  const entries: EpfMonthEntry[] = [];
  const now = new Date();
  for (const emp of employers) {
    const from = new Date(emp.fromDate);
    const to = emp.toDate ? new Date(emp.toDate) : now;
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
      const realTxn = realByMonth.get(month);
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
