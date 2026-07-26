import { useMemo, useState } from 'react';
import type { CashFlowEvent } from '@/core/cashflow/forecaster';
import { CF_TYPES, getCashFlowMeta } from '@/core/cashflow/meta';
import { toMonthYearKey } from '@/lib/date';
import { useForecast } from '@/hooks/useForecast';

export type Horizon = 'month' | 'quarter' | 'halfyear';

const HORIZON_DAYS: Record<Horizon, number> = { month: 31, quarter: 92, halfyear: 183 };

/** Forecasts the balance for the chosen horizon and groups outflow events by month for the timeline. */
export function useCashFlow() {
  const [horizon, setHorizon] = useState<Horizon>('quarter');
  const { loading, nowMs, todayStart, startBalance, events, forecast, reload } = useForecast(HORIZON_DAYS[horizon]);

  // The timeline shows upcoming *payments* — income is reflected in the projection, not here.
  const outflowEvents = useMemo(() => events.filter((e) => e.direction === 'out'), [events]);

  // Group upcoming payments by month (e.g. "2026-07") — cleaner than day-by-day;
  // the individual due date is shown per row. outflowEvents are already sorted by
  // dueMs, so each month's rows stay in date order.
  const grouped = useMemo(() => {
    const map = new Map<string, CashFlowEvent[]>();
    for (const e of outflowEvents) {
      const key = toMonthYearKey(new Date(e.dueMs));
      const bucket = map.get(key);
      if (bucket) bucket.push(e);
      else map.set(key, [e]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [outflowEvents]);

  const total = useMemo(() => outflowEvents.reduce((s, e) => s + e.amount, 0), [outflowEvents]);

  const summaryParts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of outflowEvents) counts[e.type] = (counts[e.type] ?? 0) + 1;
    return CF_TYPES.filter((t) => (counts[t] ?? 0) > 0).map((t) => {
      const cnt = counts[t] ?? 0;
      return `${cnt} ${getCashFlowMeta(t).label.toLowerCase()}${cnt > 1 ? 's' : ''}`;
    });
  }, [outflowEvents]);

  return {
    horizon,
    setHorizon,
    loading,
    grouped,
    total,
    summaryParts,
    todayStart,
    startBalance,
    forecast,
    nowMs,
    reload
  };
}
