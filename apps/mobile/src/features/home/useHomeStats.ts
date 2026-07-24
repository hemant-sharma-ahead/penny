import { useCallback, useEffect, useState } from 'react';
import { expensesRepo, expenseCategoriesRepo, insurancePoliciesRepo, liabilitiesRepo } from '@/core/db/repositories';
import { groupKey } from '@/core/expenses/categoryGroups';
import { isRoutineGroup } from '@/core/db/defaultCategories';
import { toMonthYearKey } from '@/lib/formatters';
import { useTxnRefresh } from '@/hooks/useTxnRefresh';

/** At-a-glance money facts for the Home stat card. */
export interface HomeMoneyStats {
  /** Total expense this month. */
  spentThisMonth: number;
  /** Daily-routine ("living") subset of this month's expense. */
  livingThisMonth: number;
  /** Sum of insurance coverage across policies. */
  insuranceCover: number;
  /** Sum of outstanding loan/liability balances. */
  loansOutstanding: number;
}

export function useHomeStats(): HomeMoneyStats | null {
  const [stats, setStats] = useState<HomeMoneyStats | null>(null);

  const reload = useCallback(() => {
    void Promise.all([
      expensesRepo.getAll(),
      expenseCategoriesRepo.getAll(),
      insurancePoliciesRepo.getAll(),
      liabilitiesRepo.getAll()
    ])
      .then(([expenses, cats, policies, liabilities]) => {
        const catById = new Map(cats.map((c) => [c.id, c]));
        const month = toMonthYearKey();
        let spent = 0;
        let living = 0;
        for (const e of expenses) {
          if (e.type && e.type !== 'expense') continue;
          if (toMonthYearKey(new Date(e.date)) !== month) continue;
          spent += e.amount;
          const cat = catById.get(e.categoryId);
          // Unknown category defaults to routine (matches isRoutineGroup's fallback).
          if (cat ? isRoutineGroup(groupKey(cat)) : true) living += e.amount;
        }
        setStats({
          spentThisMonth: spent,
          livingThisMonth: living,
          insuranceCover: policies.reduce((s, p) => s + (p.coverageAmount ?? 0), 0),
          loansOutstanding: liabilities.reduce((s, l) => s + l.outstandingAmount, 0)
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => reload(), [reload]);
  useTxnRefresh(reload);

  return stats;
}
