import { useCallback, useEffect, useMemo, useState } from 'react';
import { expensesRepo, goalsRepo, holdingsRepo, insurancePoliciesRepo, liabilitiesRepo } from '@/core/db/repositories';
import type { Expense, Goal, Holding, InsurancePolicy, Liability } from '@/core/db/types';
import { computeHealthScore, deriveInputs, deriveRecentMonthlyIncome } from '@/core/health/scorer';
import type { HealthScore } from '@/core/health/scorer';
import { useProfile } from '@/hooks/useProfile';
import { parseNumber } from '@/lib/formatters';
import { getItem, setItem } from '~/lib/storage';

interface LoadedData {
  holdings: Holding[];
  expenses: Expense[];
  liabilities: Liability[];
  policies: InsurancePolicy[];
  goals: Goal[];
}

/** AsyncStorage-backed, like every other simple user-editable preference in this app (see
 *  `SettingsContext.tsx`) — not an `EncryptedRepository` field, since this is just a device-local
 *  convenience number, not durable domain data on its own (the real transactions it's derived from
 *  already are). */
const MONTHLY_INCOME_KEY = 'penny_health_monthly_income';

/**
 * Loads the full financial snapshot, derives scoring inputs, and computes the health score.
 * Owns the manual monthly-income input that feeds the savings-rate and debt-to-income components.
 *
 * 2026-08-18: this used to be a plain `useState('')` — never prefilled, never persisted, resetting to
 * blank on every app restart (a real-device testing finding; same gap on web, not fixed there since
 * `apps/web-react` is frozen). Now: the persisted value (if the user has ever set/edited one, including
 * one deliberately cleared back to blank) always wins; only with no persisted value at all does this
 * fall back to prefilling from `deriveRecentMonthlyIncome` (the most recently completed calendar
 * month's genuine income transactions), which is then immediately persisted too — so it behaves as a
 * real persisted value from then on rather than silently drifting to a different "most recently
 * completed month" on some future relaunch. Still fully editable either way. Both the persisted-value
 * read and the expense load are resolved together in one `Promise.all` (not two separate effects) so
 * there's no race between them to reason about.
 */
export function useHealthScore() {
  const [nowMs] = useState(() => Date.now());
  const [data, setData] = useState<LoadedData | null>(null);
  const [monthlyIncome, setMonthlyIncomeState] = useState('');
  const { profile } = useProfile();

  const setMonthlyIncome = useCallback((value: string) => {
    setMonthlyIncomeState(value);
    void setItem(MONTHLY_INCOME_KEY, value);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getItem(MONTHLY_INCOME_KEY),
      holdingsRepo.getAll(),
      expensesRepo.getAll(),
      liabilitiesRepo.getAll(),
      insurancePoliciesRepo.getAll(),
      goalsRepo.getAll()
    ])
      .then(([persistedIncome, holdings, expenses, liabilities, policies, goals]) => {
        if (cancelled) return;
        setData({ holdings, expenses, liabilities, policies, goals });
        if (persistedIncome !== null) {
          setMonthlyIncomeState(persistedIncome);
          return;
        }
        const prefill = deriveRecentMonthlyIncome(expenses, nowMs);
        if (prefill > 0) {
          const rounded = String(Math.round(prefill));
          setMonthlyIncomeState(rounded);
          void setItem(MONTHLY_INCOME_KEY, rounded);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [nowMs]);

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

  const hasEmergencyGoal = (data?.goals ?? []).some((g) => /emergency/i.test(g.name));

  return {
    healthScore,
    derived,
    employmentType,
    hasEmergencyGoal,
    monthlyIncome,
    setMonthlyIncome,
    incomeNeeded: income <= 0
  };
}
