import { useEffect, useMemo, useState } from 'react';
import { expensesRepo, insurancePoliciesRepo, liabilitiesRepo, subscriptionsRepo } from '@/core/db/repositories';
import { forecastEvents } from '@/core/cashflow/forecaster';
import type { CashFlowEvent } from '@/core/cashflow/forecaster';
import { CF_TYPES, getCashFlowMeta } from '@/core/cashflow/meta';
import { startOfToday } from '@/lib/date';
import type { Expense, InsurancePolicy, Liability, Subscription } from '@/core/db/types';

export type Horizon = 'week' | 'month';

const HORIZON_DAYS: Record<Horizon, number> = { week: 7, month: 31 };

interface LoadedData {
  liabilities: Liability[];
  subscriptions: Subscription[];
  policies: InsurancePolicy[];
  expenses: Expense[];
}

/** Loads the recurring-outflow sources, forecasts events for the horizon, and groups them by day. */
export function useCashFlow() {
  const [nowMs] = useState(() => Date.now());
  const [horizon, setHorizon] = useState<Horizon>('month');
  const [data, setData] = useState<LoadedData | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      liabilitiesRepo.getAll(),
      subscriptionsRepo.getAll(),
      insurancePoliciesRepo.getAll(),
      expensesRepo.getAll()
    ])
      .then(([liabilities, subscriptions, policies, expenses]) => {
        if (!cancelled) setData({ liabilities, subscriptions, policies, expenses });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const events = useMemo(
    () =>
      data
        ? forecastEvents(
            data.liabilities,
            data.subscriptions,
            data.policies,
            data.expenses,
            nowMs,
            HORIZON_DAYS[horizon]
          )
        : ([] as CashFlowEvent[]),
    [data, nowMs, horizon]
  );

  const todayStart = useMemo(() => startOfToday(nowMs), [nowMs]);

  const grouped = useMemo(() => {
    const map = new Map<number, CashFlowEvent[]>();
    for (const e of events) {
      const bucket = map.get(e.dueMs);
      if (bucket) bucket.push(e);
      else map.set(e.dueMs, [e]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [events]);

  const total = useMemo(() => events.reduce((s, e) => s + e.amount, 0), [events]);

  const summaryParts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1;
    return CF_TYPES.filter((t) => (counts[t] ?? 0) > 0).map((t) => {
      const cnt = counts[t] ?? 0;
      return `${cnt} ${getCashFlowMeta(t).label.toLowerCase()}${cnt > 1 ? 's' : ''}`;
    });
  }, [events]);

  return { horizon, setHorizon, loading: data === null, grouped, total, summaryParts, todayStart };
}
