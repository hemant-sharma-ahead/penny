// Pure "this month's spend" math, extracted from `apps/mobile/src/features/home/useHomeStats.ts` so it
// can also be called from `apps/mobile/src/hooks/useTrailingLivingSpend.ts` (used by the FIRE
// Calculator's monthly-expense auto-fill) without a cross-feature import — features/home and
// features/calculators can only share logic through core/hooks/lib/components, never each other.
import type { Expense, ExpenseCategory } from '@/core/db/types';
import { groupKey } from './categoryGroups';
import { isRoutineGroup } from '@/core/db/defaultCategories';
import { toMonthYearKey } from '@/lib/date';

export interface MonthlySpend {
  /** Total expense for the month. */
  spent: number;
  /** Daily-routine ("living") subset of `spent` — excludes non-routine intent groups (e.g. set-aside
   *  spend). Unknown category defaults to routine, matching `isRoutineGroup`'s own fallback. */
  living: number;
}

export function calcMonthlyLivingSpend(
  expenses: Expense[],
  categories: ExpenseCategory[],
  monthKey: string = toMonthYearKey()
): MonthlySpend {
  const catById = new Map(categories.map((c) => [c.id, c]));
  let spent = 0;
  let living = 0;
  for (const e of expenses) {
    if (e.type && e.type !== 'expense') continue;
    if (toMonthYearKey(new Date(e.date)) !== monthKey) continue;
    spent += e.amount;
    const cat = catById.get(e.categoryId);
    if (cat ? isRoutineGroup(groupKey(cat)) : true) living += e.amount;
  }
  return { spent, living };
}
