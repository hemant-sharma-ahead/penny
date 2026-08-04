import { useCallback, useEffect, useState } from 'react';
import { expensesRepo, expenseCategoriesRepo } from '@/core/db/repositories';
import { calcMonthlyLivingSpend } from '@/core/expenses/monthlySpend';
import { useTxnRefresh } from '@/hooks/useTxnRefresh';

/**
 * This month's daily-routine ("living") spend — independent of `features/home/useHomeStats.ts`, for
 * the same cross-feature-import reason `useInvestableCorpus.ts` exists: both `features/home` (Home's
 * money-stats card) and `features/calculators` (FIRE Calculator / Retirement Corpus's "monthly expense"
 * auto-fill) need this figure, but neither feature module may import the other's hook. Both share the
 * same underlying `calcMonthlyLivingSpend()` pure function.
 */
export function useTrailingLivingSpend(): number | null {
  const [living, setLiving] = useState<number | null>(null);

  const reload = useCallback(() => {
    void Promise.all([expensesRepo.getAll(), expenseCategoriesRepo.getAll()])
      .then(([expenses, categories]) => {
        setLiving(calcMonthlyLivingSpend(expenses, categories).living);
      })
      .catch(() => {});
  }, []);

  useEffect(() => reload(), [reload]);
  useTxnRefresh(reload);

  return living;
}
