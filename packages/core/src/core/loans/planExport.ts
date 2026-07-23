import type { LoanPlanParams, AmortizationResult } from './amortization';
import { formatMonthsDuration } from '@/lib/formatters';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Cell = string | number;

export interface LoanPlanExport {
  filename: string;
  summaryRows: Cell[][];
  scheduleHeader: string[];
  scheduleRows: Cell[][];
  scheduleColWidths: number[];
}

/**
 * Builds the spreadsheet data (summary + amortization schedule) for a loan plan.
 * Pure — produces plain arrays so the platform layer can render to XLSX/CSV/native sheets.
 */
export function buildLoanPlanExport(
  planParams: LoanPlanParams,
  baseline: AmortizationResult,
  result: AmortizationResult,
  interestSaved: number,
  monthsSaved: number
): LoanPlanExport {
  const summaryRows: Cell[][] = [
    ['Penny — Loan Planner Summary'],
    [],
    ['Loan Parameters'],
    ['Principal (₹)', planParams.principal],
    ['Interest Rate', `${planParams.annualRatePct}% p.a.`],
    ['Tenure', formatMonthsDuration(planParams.tenureMonths)],
    ['Start Month', `${MONTHS[planParams.startMonth]} ${planParams.startYear}`],
    ['EMI Step-up', planParams.stepUpPct > 0 ? `${planParams.stepUpPct}% per year` : 'None'],
    ['Extra EMI / year', planParams.extraEmiPerYear > 0 ? `${planParams.extraEmiPerYear}` : 'None'],
    ['Prepayment Strategy', planParams.strategy === 'reduce_tenure' ? 'Reduce Tenure' : 'Reduce EMI'],
    [],
    ['Comparison', 'Original', 'With Plan', 'Saved'],
    [
      'Tenure',
      formatMonthsDuration(baseline.actualTenureMonths),
      formatMonthsDuration(result.actualTenureMonths),
      formatMonthsDuration(monthsSaved)
    ],
    [
      'Total Interest (₹)',
      Math.round(baseline.totalInterest),
      Math.round(result.totalInterest),
      Math.round(interestSaved)
    ],
    ['Total Paid (₹)', Math.round(baseline.totalEmiPaid), Math.round(result.totalEmiPaid + result.totalPrepayment), ''],
    ['Total Prepayment (₹)', 0, Math.round(result.totalPrepayment), '']
  ];

  const scheduleHeader = [
    'Month',
    'Date',
    'Opening Balance (₹)',
    'EMI (₹)',
    'Principal (₹)',
    'Interest (₹)',
    'Prepayment (₹)',
    'Closing Balance (₹)'
  ];

  const scheduleRows: Cell[][] = result.rows.map((r) => [
    r.month,
    r.date,
    Math.round(r.openingBalance),
    Math.round(r.emi),
    Math.round(r.principal),
    Math.round(r.interest),
    r.prepayment > 0 ? Math.round(r.prepayment) : '',
    Math.round(r.closingBalance)
  ]);

  return {
    filename: `penny-loan-${planParams.annualRatePct}pct-${planParams.tenureMonths}m.xlsx`,
    summaryRows,
    scheduleHeader,
    scheduleRows,
    scheduleColWidths: [8, 10, 22, 12, 14, 14, 16, 22]
  };
}
