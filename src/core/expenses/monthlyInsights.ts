import type { Expense, ExpenseCategory } from '@/core/db/types';

// Monthly insights (Track 6, Step 12): a recap card + anomaly nudges for a given
// month. Pure — event-exclusion is injected via `isExcluded` so this stays in
// core/ (event-hashtag logic lives in the feature/context layer).

function ymParts(ym: string): { year: number; month: number } {
  const [y, m] = ym.split('-').map(Number);
  return { year: y ?? 0, month: (m ?? 1) - 1 };
}

function inMonth(ms: number, year: number, month: number): boolean {
  const d = new Date(ms);
  return d.getFullYear() === year && d.getMonth() === month;
}

export interface MonthlyRecap {
  month: string;
  expense: number;
  income: number;
  net: number;
  txnCount: number;
  prevExpense: number;
  deltaPct: number | null; // vs previous month's expense
  topCategory?: { name: string; color: string; amount: number };
  topExpense?: { description: string; amount: number };
}

type Excluded = (e: Expense) => boolean;

/** Per-category expense spend for a month (transfers, income and excluded rows skipped). */
function categorySpend(expenses: Expense[], year: number, month: number, isExcluded: Excluded): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of expenses) {
    if ((e.type ?? 'expense') !== 'expense' || isExcluded(e)) continue;
    if (!inMonth(e.date, year, month)) continue;
    map.set(e.categoryId, (map.get(e.categoryId) ?? 0) + e.amount);
  }
  return map;
}

/** Builds the month recap: totals, net, vs-last-month, top category and biggest single expense. */
export function monthlyRecap(
  expenses: Expense[],
  categoryMap: Map<string, ExpenseCategory>,
  ym: string,
  isExcluded: Excluded
): MonthlyRecap {
  const { year, month } = ymParts(ym);
  const prev = new Date(year, month - 1, 1);

  let expense = 0;
  let income = 0;
  let txnCount = 0;
  let prevExpense = 0;
  let topExpense: { description: string; amount: number } | undefined;

  for (const e of expenses) {
    const kind = e.type ?? 'expense';
    if (kind === 'transfer') continue;
    if (inMonth(e.date, prev.getFullYear(), prev.getMonth()) && kind === 'expense' && !isExcluded(e)) {
      prevExpense += e.amount;
    }
    if (!inMonth(e.date, year, month)) continue;
    txnCount++;
    if (kind === 'income') {
      income += e.amount;
    } else if (!isExcluded(e)) {
      expense += e.amount;
      if (!topExpense || e.amount > topExpense.amount) topExpense = { description: e.description, amount: e.amount };
    }
  }

  const cats = categorySpend(expenses, year, month, isExcluded);
  let topCategory: MonthlyRecap['topCategory'];
  for (const [catId, amount] of cats) {
    if (!topCategory || amount > topCategory.amount) {
      const c = categoryMap.get(catId);
      topCategory = { name: c?.name ?? catId, color: c?.color ?? '#94a3b8', amount };
    }
  }

  return {
    month: ym,
    expense,
    income,
    net: income - expense,
    txnCount,
    prevExpense,
    deltaPct: prevExpense > 0 ? (expense - prevExpense) / prevExpense : null,
    ...(topCategory ? { topCategory } : {}),
    ...(topExpense ? { topExpense } : {})
  };
}

export interface Anomaly {
  categoryId: string;
  name: string;
  color: string;
  amount: number;
  average: number;
  pct: number; // over the (pro-rated) trailing average
}

/**
 * Categories spending notably more than their trailing 3-month average. For the
 * current (partial) month the average is pro-rated by the fraction elapsed so it
 * isn't unfairly flagged early. Returns the top movers over +25% (min ₹500).
 */
export function computeAnomalies(
  expenses: Expense[],
  categoryMap: Map<string, ExpenseCategory>,
  ym: string,
  isExcluded: Excluded,
  nowMs: number,
  limit = 3
): Anomaly[] {
  const { year, month } = ymParts(ym);
  const current = categorySpend(expenses, year, month, isExcluded);

  const avg = new Map<string, number>();
  for (let k = 1; k <= 3; k++) {
    const d = new Date(year, month - k, 1);
    for (const [cat, amt] of categorySpend(expenses, d.getFullYear(), d.getMonth(), isExcluded)) {
      avg.set(cat, (avg.get(cat) ?? 0) + amt / 3);
    }
  }

  // Pro-rate the trailing average when comparing against the current partial month.
  const now = new Date(nowMs);
  const isCurrent = now.getFullYear() === year && now.getMonth() === month;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const fraction = isCurrent ? Math.min(1, now.getDate() / daysInMonth) : 1;

  const out: Anomaly[] = [];
  for (const [categoryId, amount] of current) {
    const baseline = (avg.get(categoryId) ?? 0) * fraction;
    if (baseline < 500) continue; // no meaningful baseline
    const pct = (amount - baseline) / baseline;
    if (pct < 0.25 || amount - baseline < 500) continue;
    const c = categoryMap.get(categoryId);
    out.push({
      categoryId,
      name: c?.name ?? categoryId,
      color: c?.color ?? '#94a3b8',
      amount,
      average: Math.round(baseline),
      pct
    });
  }
  return out.sort((a, b) => b.pct - a.pct).slice(0, limit);
}
