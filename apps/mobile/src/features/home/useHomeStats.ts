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

/** Returns `{ stats, reload }` — `reload` is exposed (2026-08-31 fix) so a caller with its own manual
 *  pull-to-refresh gesture (`HomePage.tsx`) can fold this hook's own reload into it. Before this,
 *  `useHomeStats()` was only ever instantiated privately inside `MoneyStatsCard`, with its `reload`
 *  reachable by nothing outside that component — `HomePage`'s pull-to-refresh only ever called
 *  `useHome()`'s own `reload`, which never even queries `insurancePoliciesRepo`/`liabilitiesRepo` at all
 *  (it's a different summary entirely). So a stale "Track Insurance" prompt couldn't be fixed by pulling
 *  to refresh even once `notifyTxnChanged()` was added to the save path (see `useLoggedRepository.ts`) —
 *  that fixes the *live* case (another mounted screen), not a manual user-initiated refresh gesture that
 *  never touched this hook's state at all. */
export function useHomeStats(): { stats: HomeMoneyStats | null; reload: () => void } {
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

  return { stats, reload };
}
