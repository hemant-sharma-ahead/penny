import type { Expense, Goal, Holding, InsurancePolicy, Liability, EmploymentType } from '@/core/db/types';

// ── Derived input types ───────────────────────────────────────────────────────

export type ComponentStatus = 'excellent' | 'good' | 'fair' | 'poor' | 'no_data';

export interface ScoreComponent {
  key: string;
  label: string;
  icon: string;
  earned: number;
  max: number;
  status: ComponentStatus;
  insight: string;
}

export interface HealthScore {
  total: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  gradeLabel: string;
  color: string;
  components: ScoreComponent[];
}

// ── Data derivation helpers (pure, no Date.now — nowMs passed in) ─────────────

export interface DerivedInputs {
  liquidAssets: number;
  /** Emergency buffer used for scoring — the greater of liquid assets or an Emergency-fund goal's saved amount. */
  emergencyBuffer: number;
  avgMonthlyExpenses: number;
  monthlyEmiObligations: number;
  hasLifeInsurance: boolean;
  hasHealthInsurance: boolean;
  goalsOnTrack: number;
  totalActiveGoals: number;
  assetClassCount: number;
}

/** Months of expense history covered by the provided expenses array */
function expenseMonthSpan(expenses: Expense[], nowMs: number): number {
  if (expenses.length === 0) return 0;
  const earliest = Math.min(...expenses.map((e) => e.date));
  return Math.max(1, Math.ceil((nowMs - earliest) / (30 * 86_400_000)));
}

export function deriveInputs(
  holdings: Holding[],
  expenses: Expense[],
  liabilities: Liability[],
  policies: InsurancePolicy[],
  goals: Goal[],
  nowMs: number
): DerivedInputs {
  // Liquid assets: FD holdings (short-term) + MF holdings (liquid/money-market equivalent)
  const liquidAssets =
    holdings.filter((h) => h.assetClass === 'fd').reduce((s, h) => s + (h.currentValue ?? h.investedAmount), 0) +
    holdings.filter((h) => h.assetClass === 'mf').reduce((s, h) => s + (h.currentValue ?? h.investedAmount), 0);

  // Average monthly expenses over last 3 months (or all available data, min 1 month)
  const threeMonthsAgo = nowMs - 90 * 86_400_000;
  const recentExpenses = expenses.filter((e) => e.date >= threeMonthsAgo);
  const avgMonthlyExpenses =
    recentExpenses.length > 0
      ? recentExpenses.reduce((s, e) => s + e.amount, 0) / 3
      : expenses.length > 0
        ? expenses.reduce((s, e) => s + e.amount, 0) / expenseMonthSpan(expenses, nowMs)
        : 0;

  // Monthly EMI obligations: sum explicit emiAmounts + credit card 5% min
  const monthlyEmiObligations = liabilities.reduce((s, l) => {
    if (l.emiAmount !== undefined && l.emiAmount > 0) return s + l.emiAmount;
    // Credit card / OD: estimate 5% of utilisation as monthly cost
    if ((l.type === 'credit_card' || l.type === 'overdraft') && l.utilizationAmount !== undefined) {
      return s + l.utilizationAmount * 0.05;
    }
    return s;
  }, 0);

  // Emergency buffer: connect the Goals module. An "Emergency fund" goal's saved amount counts toward the
  // buffer, so contributing to it improves the score (the greater of liquid assets or the goal's balance —
  // avoids double-counting the amount the goal was seeded with).
  const emergencyGoalSaved = goals
    .filter((g) => /emergency/i.test(g.name))
    .reduce((max, g) => Math.max(max, g.currentAmount), 0);
  const emergencyBuffer = Math.max(liquidAssets, emergencyGoalSaved);

  // Insurance coverage
  const hasLifeInsurance = policies.some((p) => p.type === 'term' || p.type === 'life');
  const hasHealthInsurance = policies.some((p) => p.type === 'health');

  // Goals on track
  const activeGoals = goals.filter((g) => g.targetDate > nowMs && g.targetAmount > 0);
  const goalsOnTrack = activeGoals.filter((g) => {
    const elapsed = nowMs - g.createdAt;
    const total = g.targetDate - g.createdAt;
    if (total <= 0) return true;
    const expectedProgress = Math.min(1, elapsed / total);
    const actualProgress = g.currentAmount / g.targetAmount;
    return actualProgress >= expectedProgress * 0.9; // 10% grace
  }).length;

  // Diversification: count distinct asset classes with non-zero value
  const hasEquity = holdings.some((h) => h.assetClass === 'stock' || h.assetClass === 'mf');
  const hasDebt = holdings.some(
    (h) => h.assetClass === 'fd' || h.assetClass === 'ppf' || h.assetClass === 'nps' || h.assetClass === 'epf'
  );
  const hasGold = holdings.some((h) => h.assetClass === 'gold');
  const hasRealEstate = holdings.some((h) => h.assetClass === 'property');
  const assetClassCount = [hasEquity, hasDebt, hasGold, hasRealEstate].filter(Boolean).length;

  return {
    liquidAssets,
    emergencyBuffer,
    avgMonthlyExpenses,
    monthlyEmiObligations,
    hasLifeInsurance,
    hasHealthInsurance,
    goalsOnTrack,
    totalActiveGoals: activeGoals.length,
    assetClassCount
  };
}

// ── Component scoring ─────────────────────────────────────────────────────────

function status(earned: number, max: number, hasData: boolean): ComponentStatus {
  if (!hasData) return 'no_data';
  const r = earned / max;
  if (r >= 1) return 'excellent';
  if (r >= 0.75) return 'good';
  if (r >= 0.5) return 'fair';
  return 'poor';
}

// Target emergency-fund months by employment type — irregular incomes need a bigger buffer.
export const EMERGENCY_FUND_TARGET: Record<EmploymentType, number> = {
  salaried: 6,
  self_employed: 12,
  business_owner: 12,
  student: 3,
  retired: 6
};

/** Recommended emergency-fund months for an employment type (default 6). */
export function emergencyFundMonths(employmentType?: EmploymentType): number {
  return employmentType ? EMERGENCY_FUND_TARGET[employmentType] : 6;
}

function emergencyFundComponent(
  liquidAssets: number,
  avgMonthlyExpenses: number,
  employmentType?: EmploymentType
): ScoreComponent {
  const target = employmentType ? EMERGENCY_FUND_TARGET[employmentType] : 6;
  const hasData = avgMonthlyExpenses > 0;
  const months = hasData ? liquidAssets / avgMonthlyExpenses : 0;
  const earned = !hasData
    ? 0
    : months >= target
      ? 20
      : months >= target * (4 / 6)
        ? 15
        : months >= target * (3 / 6)
          ? 10
          : months >= target * (1.5 / 6)
            ? 5
            : 0;

  const insight = !hasData
    ? 'Add expenses to evaluate your emergency fund'
    : months >= target
      ? `${months.toFixed(1)} months covered — excellent buffer`
      : `${months.toFixed(1)} months covered — aim for ${target}`;

  return {
    key: 'emergency_fund',
    label: 'Emergency Fund',
    icon: 'ti-shield-check',
    earned,
    max: 20,
    status: status(earned, 20, hasData),
    insight
  };
}

function savingsRateComponent(monthlyIncome: number, avgMonthlyExpenses: number): ScoreComponent {
  const hasData = monthlyIncome > 0 && avgMonthlyExpenses > 0;
  const savings = monthlyIncome - avgMonthlyExpenses;
  const rate = hasData ? savings / monthlyIncome : 0;
  const earned = !hasData ? 0 : rate >= 0.3 ? 20 : rate >= 0.2 ? 15 : rate >= 0.1 ? 10 : rate >= 0.05 ? 5 : 0;

  const insight = !monthlyIncome
    ? 'Enter monthly income to evaluate savings rate'
    : rate >= 0.3
      ? `Saving ${(rate * 100).toFixed(0)}% of income — great discipline`
      : rate >= 0.1
        ? `Saving ${(rate * 100).toFixed(0)}% — target 20–30% for wealth building`
        : rate > 0
          ? `Only saving ${(rate * 100).toFixed(0)}% — look for ways to cut expenses`
          : 'Expenses exceed income — review your budget';

  return {
    key: 'savings_rate',
    label: 'Savings Rate',
    icon: 'ti-piggy-bank',
    earned,
    max: 20,
    status: status(earned, 20, hasData),
    insight
  };
}

function debtIncomeComponent(monthlyEmi: number, monthlyIncome: number): ScoreComponent {
  const hasData = monthlyIncome > 0;
  const dti = hasData ? monthlyEmi / monthlyIncome : 0;
  const earned = !hasData ? 0 : dti <= 0.2 ? 20 : dti <= 0.3 ? 15 : dti <= 0.4 ? 10 : dti <= 0.5 ? 5 : 0;

  const insight = !monthlyIncome
    ? 'Enter monthly income to evaluate debt burden'
    : monthlyEmi === 0
      ? 'No active loan obligations — excellent'
      : dti <= 0.2
        ? `${(dti * 100).toFixed(0)}% of income on debt — well managed`
        : dti <= 0.4
          ? `${(dti * 100).toFixed(0)}% of income on debt — within acceptable range`
          : `${(dti * 100).toFixed(0)}% of income on debt — this is high, consider prepaying`;

  return {
    key: 'debt_income',
    label: 'Debt-to-Income',
    icon: 'ti-credit-card',
    earned,
    max: 20,
    status: status(earned, 20, hasData),
    insight
  };
}

function insuranceComponent(hasLife: boolean, hasHealth: boolean): ScoreComponent {
  const earned = hasLife && hasHealth ? 15 : hasLife ? 8 : hasHealth ? 7 : 0;
  const insight =
    hasLife && hasHealth
      ? 'Life and health insurance present — well covered'
      : hasLife
        ? 'Life covered — add health insurance for complete protection'
        : hasHealth
          ? 'Health covered — consider a term plan for life protection'
          : 'No insurance found — add policies to protect against risk';

  return {
    key: 'insurance',
    label: 'Insurance',
    icon: 'ti-heart-rate-monitor',
    earned,
    max: 15,
    status: status(earned, 15, true),
    insight
  };
}

function goalsComponent(goalsOnTrack: number, totalActiveGoals: number): ScoreComponent {
  const hasData = totalActiveGoals > 0;
  const ratio = hasData ? goalsOnTrack / totalActiveGoals : 0;
  const earned = !hasData ? 0 : Math.round(15 * ratio);
  const insight = !hasData
    ? 'Add financial goals to track your progress'
    : goalsOnTrack === totalActiveGoals
      ? `All ${totalActiveGoals} goals on track — keep it up`
      : `${goalsOnTrack} of ${totalActiveGoals} goals on track — review the lagging ones`;

  return {
    key: 'goals',
    label: 'Goals on Track',
    icon: 'ti-target',
    earned,
    max: 15,
    status: status(earned, 15, hasData),
    insight
  };
}

function diversificationComponent(assetClassCount: number): ScoreComponent {
  const hasData = assetClassCount > 0;
  const earned =
    assetClassCount >= 4 ? 10 : assetClassCount >= 3 ? 7 : assetClassCount >= 2 ? 4 : assetClassCount >= 1 ? 2 : 0;
  const insight =
    assetClassCount >= 4
      ? 'Spread across 4+ asset classes — well diversified'
      : assetClassCount >= 2
        ? `${assetClassCount} asset classes — add more to reduce concentration risk`
        : assetClassCount === 1
          ? '1 asset class — diversify across equity, debt, and gold'
          : 'No holdings found — start investing to build wealth';

  return {
    key: 'diversification',
    label: 'Diversification',
    icon: 'ti-chart-pie',
    earned,
    max: 10,
    status: status(earned, 10, hasData),
    insight
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function computeHealthScore(
  inputs: DerivedInputs,
  monthlyIncome: number,
  employmentType?: EmploymentType
): HealthScore {
  const components: ScoreComponent[] = [
    emergencyFundComponent(inputs.emergencyBuffer, inputs.avgMonthlyExpenses, employmentType),
    savingsRateComponent(monthlyIncome, inputs.avgMonthlyExpenses),
    debtIncomeComponent(inputs.monthlyEmiObligations, monthlyIncome),
    insuranceComponent(inputs.hasLifeInsurance, inputs.hasHealthInsurance),
    goalsComponent(inputs.goalsOnTrack, inputs.totalActiveGoals),
    diversificationComponent(inputs.assetClassCount)
  ];

  const total = Math.round(components.reduce((s, c) => s + c.earned, 0));

  const grade: HealthScore['grade'] =
    total >= 90 ? 'A' : total >= 75 ? 'B' : total >= 60 ? 'C' : total >= 40 ? 'D' : 'F';

  const gradeLabel =
    total >= 90 ? 'Excellent' : total >= 75 ? 'Good' : total >= 60 ? 'Fair' : total >= 40 ? 'Needs work' : 'Critical';

  const color =
    total >= 90 ? '#00A86B' : total >= 75 ? '#10b981' : total >= 60 ? '#f59e0b' : total >= 40 ? '#f97316' : '#ef4444';

  return { total, grade, gradeLabel, color, components };
}
