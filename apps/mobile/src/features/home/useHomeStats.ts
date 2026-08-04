import { useCallback, useEffect, useState } from 'react';
import { expensesRepo, expenseCategoriesRepo, insurancePoliciesRepo, liabilitiesRepo } from '@/core/db/repositories';
import { calcMonthlyLivingSpend } from '@/core/expenses/monthlySpend';
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
        const { spent, living } = calcMonthlyLivingSpend(expenses, cats);
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
