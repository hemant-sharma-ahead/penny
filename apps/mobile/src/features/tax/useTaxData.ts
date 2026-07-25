import { useEffect, useMemo, useState } from 'react';
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
 * RN port of apps/web-legacy/src/features/tax/useTaxData.ts — unchanged. Loads the portfolio/insurance/
 * liability snapshot once and derives the full tax summary (deductions + capital gains).
 */
export function useTaxData(): { summary: TaxSummary | null } {
  const [nowMs] = useState(() => Date.now());
  const [data, setData] = useState<LoadedData | null>(null);

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
  }, []);

  const summary = useMemo(
    () => (data ? computeTaxSummary(data.policies, data.liabilities, data.holdings, nowMs) : null),
    [data, nowMs]
  );

  return { summary };
}
