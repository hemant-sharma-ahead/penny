import type { Expense, ExpenseCategory } from '@/core/db/types';

// Annual analytics (Track 6): per-month income vs expense, a forward projection
// for the rest of the year, savings rate, and biggest category movers. Pure — no
// DB access. Annual view shows TRUE totals (events included), unlike the monthly
// run-rate which excludes one-off event spend.

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface MonthPoint {
  month: string; // YYYY-MM
  label: string;
  expense: number;
  income: number;
  net: number; // income − expense
  projected: boolean;
}

function ym(year: number, monthIdx: number): string {
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
}

/** Expense + income totals for one calendar month (transfers excluded). */
function monthlyTotals(expenses: Expense[], year: number, monthIdx: number): { expense: number; income: number } {
  let expense = 0;
  let income = 0;
  for (const e of expenses) {
    const t = e.type ?? 'expense';
    if (t === 'transfer') continue;
    const d = new Date(e.date);
    if (d.getFullYear() !== year || d.getMonth() !== monthIdx) continue;
    if (t === 'income') income += e.amount;
    else expense += e.amount;
  }
  return { expense, income };
}

/** Average expense & income over the 3 full calendar months before the current month. */
function trailingAverages(expenses: Expense[], nowMs: number): { expense: number; income: number } {
  const now = new Date(nowMs);
  let expSum = 0;
  let incSum = 0;
  for (let k = 1; k <= 3; k++) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const { expense, income } = monthlyTotals(expenses, d.getFullYear(), d.getMonth());
    expSum += expense;
    incSum += income;
  }
  return { expense: Math.round(expSum / 3), income: Math.round(incSum / 3) };
}

/**
 * 12-month income/expense series for `year`. Months after the current month (in
 * the current year, or all months of a future year) are PROJECTED from the
 * trailing 3-month average; past/current months are actual.
 */
export function buildAnnualSeries(expenses: Expense[], year: number, nowMs: number): MonthPoint[] {
  const now = new Date(nowMs);
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  const avg = trailingAverages(expenses, nowMs);

  return Array.from({ length: 12 }, (_, m) => {
    const label = MONTH_LABELS[m] ?? '';
    const isFuture = year > curYear || (year === curYear && m > curMonth);
    if (isFuture) {
      return {
        month: ym(year, m),
        label,
        expense: avg.expense,
        income: avg.income,
        net: avg.income - avg.expense,
        projected: true
      };
    }
    const { expense, income } = monthlyTotals(expenses, year, m);
    return { month: ym(year, m), label, expense, income, net: income - expense, projected: false };
  });
}

export interface SavingsSummary {
  income: number;
  expense: number;
  saved: number;
  rate: number; // saved ÷ income (0 when no income)
}

/** Savings summary over the actual (non-projected) months of a series. */
export function computeSavingsRate(series: MonthPoint[]): SavingsSummary {
  const actual = series.filter((p) => !p.projected);
  const income = actual.reduce((s, p) => s + p.income, 0);
  const expense = actual.reduce((s, p) => s + p.expense, 0);
  const saved = income - expense;
  return { income, expense, saved, rate: income > 0 ? saved / income : 0 };
}

function categorySpend(expenses: Expense[], year: number, monthIdx: number): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of expenses) {
    if ((e.type ?? 'expense') !== 'expense') continue;
    const d = new Date(e.date);
    if (d.getFullYear() !== year || d.getMonth() !== monthIdx) continue;
    map.set(e.categoryId, (map.get(e.categoryId) ?? 0) + e.amount);
  }
  return map;
}

export interface CategoryMover {
  categoryId: string;
  name: string;
  color: string;
  pct: number; // change vs trailing average (e.g. 0.38 = +38%)
  current: number;
  average: number;
}

/**
 * Biggest category movers: the last completed month's spend per category vs the
 * average of the 3 months before it. Tiny categories (both < ₹1,000) are ignored.
 * Returns the top `limit` by absolute % change.
 */
export function biggestMovers(
  expenses: Expense[],
  categoryMap: Map<string, ExpenseCategory>,
  nowMs: number,
  limit = 3
): CategoryMover[] {
  const now = new Date(nowMs);
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1); // last completed month
  const current = categorySpend(expenses, last.getFullYear(), last.getMonth());

  const avgByCat = new Map<string, number>();
  for (let k = 1; k <= 3; k++) {
    const d = new Date(last.getFullYear(), last.getMonth() - k, 1);
    for (const [cat, amt] of categorySpend(expenses, d.getFullYear(), d.getMonth())) {
      avgByCat.set(cat, (avgByCat.get(cat) ?? 0) + amt / 3);
    }
  }

  const movers: CategoryMover[] = [];
  for (const [categoryId, cur] of current) {
    const average = avgByCat.get(categoryId) ?? 0;
    if (average <= 0) continue; // no baseline to compare against
    if (average < 1000 && cur < 1000) continue; // ignore noise
    const c = categoryMap.get(categoryId);
    movers.push({
      categoryId,
      name: c?.name ?? categoryId,
      color: c?.color ?? '#94a3b8',
      pct: (cur - average) / average,
      current: cur,
      average: Math.round(average)
    });
  }
  return movers.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, limit);
}
