import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  accountsRepo,
  expensesRepo,
  goalContributionsRepo,
  goalsRepo,
  insurancePoliciesRepo,
  liabilitiesRepo,
  subscriptionsRepo
} from '@/core/db/repositories';
import { forecastEvents, projectBalance, type BalanceForecast, type CashFlowEvent } from '@/core/cashflow/forecaster';
import { computeDueRecurring, type DueRecurring } from '@/core/expenses/recurringDue';
import { goalReservations, totalGoalReserved, type GoalReservation } from '@/core/goals/progress';
import { useTxnRefresh } from '@/hooks/useTxnRefresh';
import { computeBalance } from '@/core/accounts/balanceCalculator';
import { useSettings } from '~/context/SettingsContext';
import { startOfToday } from '@/lib/date';
import type {
  Account,
  Expense,
  Goal,
  GoalContribution,
  InsurancePolicy,
  Liability,
  Subscription
} from '@/core/db/types';

interface LoadedData {
  liabilities: Liability[];
  subscriptions: Subscription[];
  policies: InsurancePolicy[];
  expenses: Expense[];
  accounts: Account[];
  goals: Goal[];
  contributions: GoalContribution[];
}

/** Liquid accounts — cash, bank, wallet (credit cards are liabilities, not balance). */
const LIQUID_TYPES = new Set<Account['type']>(['cash', 'bank', 'wallet']);

export interface ForecastResult {
  loading: boolean;
  nowMs: number;
  todayStart: number;
  startBalance: number;
  events: CashFlowEvent[];
  forecast: BalanceForecast;
  dueRecurring: DueRecurring[];
  /** Money saved across every "counts toward Safe to spend" goal (2026-08-02) — see
   *  `core/goals/progress.ts`. Subtracted from `forecast.discretionary` to get `safeToSpend`. */
  goalReserved: number;
  /** Every goal's saved amount + whether it counts, for a "what's excluded" breakdown UI. */
  goalBreakdown: GoalReservation[];
  /** `forecast.discretionary − goalReserved`, before clamping to 0 — negative means upcoming commitments
   *  plus goal reservations exceed your liquid balance. */
  safeToSpendRaw: number;
  /** The number to actually show as "Safe to spend" everywhere (Home, Expenses, Cash Flow) — goal money
   *  excluded, never negative. */
  safeToSpend: number;
  /** `safeToSpend` spread over `forecast.daysLeft`. */
  safeToSpendPerDay: number;
  reload: () => void;
}

/**
 * RN port of apps/web-react/src/hooks/useForecast.ts — same logic, unchanged; only the
 * SettingsContext import points at the mobile context.
 * Loads the recurring-flow sources + accounts, computes the current liquid
 * balance, and projects it forward over `horizonDays`. Shared by the Cash Flow
 * page and the "safe to spend" surfaces (Home, Expenses) — lives in hooks/ so
 * features can use it without cross-importing each other.
 *
 * 2026-08-02: also loads goals + their contributions (independently of `features/goals/useGoals.ts` —
 * this hook lives in `~/hooks/`, so it can't depend on a feature module's own hook) so "Safe to spend"
 * excludes money already saved toward a goal, not just committed bills. `forecast.discretionary` itself
 * stays goal-agnostic (still the pure balance/commitments/buffer figure other call sites may reason
 * about); the goal-adjusted numbers are the new `safeToSpend*` fields.
 */
export function useForecast(horizonDays = 31): ForecastResult {
  const { cashflowBuffer } = useSettings();
  const [nowMs] = useState(() => Date.now());
  const [data, setData] = useState<LoadedData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  useTxnRefresh(reload);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      liabilitiesRepo.getAll(),
      subscriptionsRepo.getAll(),
      insurancePoliciesRepo.getAll(),
      expensesRepo.getAll(),
      accountsRepo.getAll(),
      goalsRepo.getAll(),
      goalContributionsRepo.getAll()
    ])
      .then(([liabilities, subscriptions, policies, expenses, accounts, goals, contributions]) => {
        if (!cancelled) setData({ liabilities, subscriptions, policies, expenses, accounts, goals, contributions });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const todayStart = useMemo(() => startOfToday(nowMs), [nowMs]);

  const startBalance = useMemo(() => {
    if (!data) return 0;
    return data.accounts
      .filter((a) => !a.isArchived && LIQUID_TYPES.has(a.type))
      .reduce((sum, a) => sum + computeBalance(a.id, a.openingBalance, data.expenses), 0);
  }, [data]);

  const events = useMemo(
    () =>
      data
        ? forecastEvents(data.liabilities, data.subscriptions, data.policies, data.expenses, nowMs, horizonDays)
        : ([] as CashFlowEvent[]),
    [data, nowMs, horizonDays]
  );

  const forecast = useMemo(
    () => projectBalance(startBalance, events, nowMs, horizonDays, cashflowBuffer),
    [startBalance, events, nowMs, horizonDays, cashflowBuffer]
  );

  const dueRecurring = useMemo(() => (data ? computeDueRecurring(data.expenses, nowMs) : []), [data, nowMs]);

  const goalBreakdown = useMemo(() => (data ? goalReservations(data.goals, data.contributions) : []), [data]);
  const goalReserved = useMemo(() => totalGoalReserved(goalBreakdown), [goalBreakdown]);
  const safeToSpendRaw = forecast.discretionary - goalReserved;
  const safeToSpend = Math.max(0, safeToSpendRaw);
  const safeToSpendPerDay = safeToSpend / forecast.daysLeft;

  return {
    loading: data === null,
    nowMs,
    todayStart,
    startBalance,
    events,
    forecast,
    dueRecurring,
    goalReserved,
    goalBreakdown,
    safeToSpendRaw,
    safeToSpend,
    safeToSpendPerDay,
    reload
  };
}
