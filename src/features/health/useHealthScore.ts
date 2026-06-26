import { useEffect, useMemo, useState } from 'react';
import { expensesRepo, goalsRepo, holdingsRepo, insurancePoliciesRepo, liabilitiesRepo } from '@/core/db/repositories';
import type { Expense, Goal, Holding, InsurancePolicy, Liability } from '@/core/db/types';
import { computeHealthScore, deriveInputs } from '@/core/health/scorer';
import type { HealthScore } from '@/core/health/scorer';
import { useProfile } from '@/hooks/useProfile';
import { parseNumber } from '@/lib/formatters';

interface LoadedData {
  holdings: Holding[];
  expenses: Expense[];
  liabilities: Liability[];
  policies: InsurancePolicy[];
  goals: Goal[];
}

/**
 * Loads the full financial snapshot, derives scoring inputs, and computes the health score.
 * Owns the manual monthly-income input that feeds the savings-rate and debt-to-income components.
 */
export function useHealthScore() {
  const [nowMs] = useState(() => Date.now());
  const [data, setData] = useState<LoadedData | null>(null);
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const { profile } = useProfile();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      holdingsRepo.getAll(),
      expensesRepo.getAll(),
      liabilitiesRepo.getAll(),
      insurancePoliciesRepo.getAll(),
      goalsRepo.getAll()
    ])
      .then(([holdings, expenses, liabilities, policies, goals]) => {
        if (!cancelled) setData({ holdings, expenses, liabilities, policies, goals });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const derived = useMemo(
    () =>
      data ? deriveInputs(data.holdings, data.expenses, data.liabilities, data.policies, data.goals, nowMs) : null,
    [data, nowMs]
  );

  const income = parseNumber(monthlyIncome);
  const employmentType = profile?.employmentType;
  const healthScore: HealthScore | null = useMemo(
    () => (derived ? computeHealthScore(derived, income > 0 ? income : 0, employmentType) : null),
    [derived, income, employmentType]
  );

  return { healthScore, monthlyIncome, setMonthlyIncome, incomeNeeded: income <= 0 };
}
