import { useCallback, useEffect, useState } from 'react';
import { accountsRepo, expensesRepo, holdingsRepo } from '@/core/db/repositories';
import { calcLiquidFunds } from '@/core/accounts/balanceCalculator';
import { calcInvestableCorpus } from '@/core/calculators/retirementProjection';
import { useTxnRefresh } from '@/hooks/useTxnRefresh';
import { useAccountsRefresh } from '@/hooks/useDataRefresh';

/**
 * Live investable corpus (mf/stock/fd/nps/ppf/epf/gold holdings + liquid funds — see
 * `core/calculators/retirementProjection.ts`'s `calcInvestableCorpus()`), independent of
 * `features/home/useHome.ts`. Lives in `~/hooks/` rather than a feature module specifically so both
 * `features/home` (the Retirement Corpus card) and `features/calculators` (FIRE Calculator's "Current
 * corpus" prefill) can read the exact same figure — feature modules can't cross-import each other, only
 * core/hooks/lib/components, per the architecture ESLint rule. Both call sites share the underlying
 * `calcLiquidFunds`/`calcInvestableCorpus` pure math; only the repo fetch itself is duplicated.
 */
export function useInvestableCorpus(): number | null {
  const [value, setValue] = useState<number | null>(null);

  const reload = useCallback(() => {
    void Promise.all([holdingsRepo.getAll(), accountsRepo.getAll(), expensesRepo.getAll()])
      .then(([holdings, accounts, expenses]) => {
        setValue(calcInvestableCorpus(holdings, calcLiquidFunds(accounts, expenses)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => reload(), [reload]);
  useTxnRefresh(reload);
  useAccountsRefresh(reload);

  return value;
}
