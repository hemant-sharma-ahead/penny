// Income-derivation helpers for the Tax Footprint. The earn→spend→savings reconciliation itself
// lives in `incomeWaterfall.ts`; this file just sources the gross-income figure from data.

import type { Expense } from '@/core/db/types';
import type { FYWindow } from './indirectTax';
import type { DetectedIncome } from '@/core/cashflow/incomeDetector';

/** Sum of income-type transactions within the FY window. */
export function sumFyIncome(expenses: Expense[], fy: FYWindow): number {
  return expenses
    .filter((e) => e.type === 'income' && e.date >= fy.start && e.date <= fy.end)
    .reduce((s, e) => s + e.amount, 0);
}

/** Annualised gross from detected recurring incomes (amount × occurrences/year). */
export function annualiseRecurringIncome(detected: DetectedIncome[]): number {
  return detected.reduce((s, d) => s + d.detectedAmount * (365 / d.intervalDays), 0);
}
