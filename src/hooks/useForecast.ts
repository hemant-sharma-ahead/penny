import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  accountsRepo,
  expensesRepo,
  insurancePoliciesRepo,
  liabilitiesRepo,
  subscriptionsRepo
} from '@/core/db/repositories';
import { forecastEvents, projectBalance, type BalanceForecast, type CashFlowEvent } from '@/core/cashflow/forecaster';
import { computeDueRecurring, type DueRecurring } from '@/core/expenses/recurringDue';
import { computeBalance } from '@/core/accounts/balanceCalculator';
import { useSettings } from '@/context/SettingsContext';
import { startOfToday } from '@/lib/date';
import type { Account, Expense, InsurancePolicy, Liability, Subscription } from '@/core/db/types';

interface LoadedData {
  liabilities: Liability[];
  subscriptions: Subscription[];
  policies: InsurancePolicy[];
  expenses: Expense[];
  accounts: Account[];
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
  reload: () => void;
}

/**
 * Loads the recurring-flow sources + accounts, computes the current liquid
 * balance, and projects it forward over `horizonDays`. Shared by the Cash Flow
 * page and the "safe to spend" surfaces (Home, Expenses) — lives in hooks/ so
 * features can use it without cross-importing each other.
 */
export function useForecast(horizonDays = 31): ForecastResult {
  const { cashflowBuffer } = useSettings();
  const [nowMs] = useState(() => Date.now());
  const [data, setData] = useState<LoadedData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      liabilitiesRepo.getAll(),
      subscriptionsRepo.getAll(),
      insurancePoliciesRepo.getAll(),
      expensesRepo.getAll(),
      accountsRepo.getAll()
    ])
      .then(([liabilities, subscriptions, policies, expenses, accounts]) => {
        if (!cancelled) setData({ liabilities, subscriptions, policies, expenses, accounts });
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

  return { loading: data === null, nowMs, todayStart, startBalance, events, forecast, dueRecurring, reload };
}
