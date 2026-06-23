import { calcEmi } from './calculator';

export interface Prepayment {
  month: number; // 1-indexed month number in the schedule
  amount: number;
}

export interface LoanPlanParams {
  principal: number;
  annualRatePct: number;
  tenureMonths: number;
  startYear: number; // full year e.g. 2025
  startMonth: number; // 0-indexed (0=Jan)
  stepUpPct: number; // % EMI increase every 12 months, 0 = none
  extraEmiPerYear: number; // integer, 0 = none
  prepayments: Prepayment[];
  strategy: 'reduce_tenure' | 'reduce_emi';
}

export interface AmortizationRow {
  month: number; // 1-indexed
  date: string; // "Jan 2026"
  openingBalance: number;
  emi: number;
  principal: number;
  interest: number;
  prepayment: number;
  closingBalance: number;
}

export interface AmortizationResult {
  rows: AmortizationRow[];
  totalInterest: number;
  totalEmiPaid: number;
  totalPrepayment: number;
  actualTenureMonths: number;
}

function rowDate(startYear: number, startMonth: number, offset: number): string {
  const d = new Date(startYear, startMonth + offset);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

export function calcAmortization(p: LoanPlanParams): AmortizationResult {
  const { principal, annualRatePct, tenureMonths, stepUpPct, extraEmiPerYear, prepayments, strategy } = p;
  if (principal <= 0 || tenureMonths <= 0 || annualRatePct <= 0) {
    return { rows: [], totalInterest: 0, totalEmiPaid: 0, totalPrepayment: 0, actualTenureMonths: 0 };
  }

  const r = annualRatePct / 100 / 12;
  let emi = calcEmi(principal, annualRatePct, tenureMonths);

  // Extra EMI months: spread N extra EMIs evenly across each 12-month block
  const extraEmiSet = new Set<number>();
  if (extraEmiPerYear > 0) {
    const interval = Math.floor(12 / extraEmiPerYear);
    for (let m = interval; m <= tenureMonths * 2; m += interval) {
      extraEmiSet.add(m);
    }
  }

  // Prepayment map for O(1) lookup
  const prepayMap = new Map<number, number>();
  for (const pp of prepayments) {
    prepayMap.set(pp.month, (prepayMap.get(pp.month) ?? 0) + pp.amount);
  }

  const rows: AmortizationRow[] = [];
  let balance = principal;
  let month = 1;
  const maxMonths = tenureMonths * 3; // safety cap

  while (balance > 0.5 && month <= maxMonths) {
    // Step-up: increase base EMI every 12 months (starting from month 13)
    if (stepUpPct > 0 && month > 1 && (month - 1) % 12 === 0) {
      emi = emi * (1 + stepUpPct / 100);
    }

    const interest = balance * r;
    const actualEmi = Math.min(emi, balance + interest); // don't overpay
    const principalPaid = actualEmi - interest;

    // Collect this month's prepayment (scheduled + extra EMI)
    let prepayment = prepayMap.get(month) ?? 0;
    if (extraEmiSet.has(month)) prepayment += emi;

    // Clamp so balance doesn't go below 0
    const maxPrepay = Math.max(0, balance - principalPaid);
    if (prepayment > maxPrepay) prepayment = maxPrepay;

    const closing = Math.max(0, balance - principalPaid - prepayment);

    rows.push({
      month,
      date: rowDate(p.startYear, p.startMonth, month - 1),
      openingBalance: balance,
      emi: actualEmi,
      principal: principalPaid,
      interest,
      prepayment,
      closingBalance: closing
    });

    balance = closing;

    // Reduce-EMI strategy: recalculate EMI after any prepayment
    if (strategy === 'reduce_emi' && prepayment > 0 && balance > 0) {
      const remaining = tenureMonths - month;
      if (remaining > 0) emi = calcEmi(balance, annualRatePct, remaining);
    }

    if (balance <= 0) break;
    month++;
  }

  const totalInterest = rows.reduce((s, r) => s + r.interest, 0);
  const totalEmiPaid = rows.reduce((s, r) => s + r.emi, 0);
  const totalPrepayment = rows.reduce((s, r) => s + r.prepayment, 0);

  return { rows, totalInterest, totalEmiPaid, totalPrepayment, actualTenureMonths: rows.length };
}

/** Derive remaining tenure (months) from outstanding balance + rate + EMI */
export function deriveTenureMonths(outstanding: number, annualRatePct: number, emi: number): number {
  if (outstanding <= 0 || emi <= 0 || annualRatePct <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (emi <= outstanding * r) return 0; // EMI doesn't cover interest
  const n = -Math.log(1 - (outstanding * r) / emi) / Math.log(1 + r);
  return Math.max(1, Math.round(n));
}
