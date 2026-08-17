import { useCallback, useEffect, useMemo, useState } from 'react';
import { holdingsRepo, insurancePoliciesRepo, liabilitiesRepo } from '@/core/db/repositories';
import type { Holding, InsurancePolicy, Liability } from '@/core/db/types';
import { computeTaxSummary } from '@/core/tax/calculator';
import type { TaxSummary } from '@/core/tax/calculator';

interface LoadedData {
  holdings: Holding[];
  policies: InsurancePolicy[];
  liabilities: Liability[];
}

/**
 * RN port of apps/web-react/src/features/tax/useTaxData.ts. Loads the portfolio/insurance/liability
 * snapshot once and derives the full tax summary (deductions + capital gains).
 *
 * 2026-08-16: added `reload` (bumps `reloadKey`, re-running the same load effect) for pull-to-refresh
 * on `TaxAwarenessPage` — mirrors `useForecast.ts`'s established reloadKey idiom, which keeps the
 * `cancelled`-guard-per-effect-run safety free rather than juggling it manually across a shared function.
 */
export function useTaxData(): { summary: TaxSummary | null; reload: () => void } {
  const [nowMs] = useState(() => Date.now());
  const [data, setData] = useState<LoadedData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([holdingsRepo.getAll(), insurancePoliciesRepo.getAll(), liabilitiesRepo.getAll()])
      .then(([holdings, policies, liabilities]) => {
        if (cancelled) return;
        setData({ holdings, policies, liabilities });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const summary = useMemo(
    () => (data ? computeTaxSummary(data.policies, data.liabilities, data.holdings, nowMs) : null),
    [data, nowMs]
  );

  return { summary, reload };
}
