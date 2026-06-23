import type { AssetMeta, EpfEmployer } from '@/core/db/types';

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
  interestEarned: number;
}

export function epfCurrentEmployer(employers: EpfEmployer[]): EpfEmployer | null {
  return employers.find((e) => !e.toDate) ?? null;
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

export function epfLatestSalary(emp: EpfEmployer): number {
  const sorted = [...(emp.hikeTimeline ?? [])].sort((a, b) => b.fromDate - a.fromDate);
  return sorted[0]?.basicSalary ?? emp.basicSalary;
}

export function epfMonthToFy(month: string): { label: string; startYear: number } {
  const [y = 0, m = 0] = month.split('-').map(Number);
  const s = m >= 4 ? y : y - 1;
  return { label: `FY ${s}-${String(s + 1).slice(2)}`, startYear: s };
}

export function epfComputeAllMonths(employers: EpfEmployer[]): EpfMonthEntry[] {
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
      entries.push({
        month,
        fyLabel: fy.label,
        fyStartYear: fy.startYear,
        companyName: emp.companyName,
        empAmount: Math.round(epfGetSalaryForMonth(emp, month) * (emp.employeeContribPct / 100) * fraction),
        eplrEpfAmount: Math.round(epfGetSalaryForMonth(emp, month) * EPF_EMPLOYER_EPF_PCT * fraction),
        epsAmount: Math.round(epfGetSalaryForMonth(emp, month) * EPS_PCT * fraction),
        ...(isPartial && { proRata: { workedDays, totalDays: daysInMonth } })
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

  let employeeTotal = 0;
  let employerTotal = 0;
  let interestEarned = 0;
  let corpus = 0;
  for (const t of txns) {
    if (t.type === 'contribution') {
      employeeTotal += t.employeeAmount ?? 0;
      employerTotal += t.employerAmount ?? 0;
      corpus += (t.employeeAmount ?? 0) + (t.employerAmount ?? 0);
    } else if (t.type === 'interest') {
      interestEarned += t.amount ?? 0;
      corpus += t.amount ?? 0;
    } else if (t.type === 'transfer_in') {
      corpus += t.amount ?? 0;
    } else if (t.type === 'withdrawal' || t.type === 'advance') {
      corpus -= t.amount ?? 0;
    }
  }
  corpus = Math.max(0, corpus);

  if (txns.length === 0 && employers.length > 0) {
    const allMonths = epfComputeAllMonths(employers);
    for (const m of allMonths) {
      employeeTotal += m.empAmount;
      employerTotal += m.eplrEpfAmount;
      corpus += m.empAmount + m.eplrEpfAmount;
    }
  }

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
    interestEarned
  };
}
