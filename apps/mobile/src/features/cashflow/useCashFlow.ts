import { useMemo, useState } from 'react';
import type { CashFlowEvent } from '@/core/cashflow/forecaster';
import { CF_TYPES, getCashFlowMeta } from '@/core/cashflow/meta';
import { toMonthYearKey } from '@/lib/date';
import { useForecast } from '~/hooks/useForecast';

export type Horizon = 'month' | 'quarter' | 'halfyear';

const HORIZON_DAYS: Record<Horizon, number> = { month: 31, quarter: 92, halfyear: 183 };

/**
 * RN port of apps/web-react/src/features/cashflow/useCashFlow.ts — unchanged logic, only the
 * `useForecast` import points at mobile's own copy (`~/hooks/useForecast.ts`, already platform-agnostic
 * besides its `SettingsContext` import).
 */
export function useCashFlow() {
  const [horizon, setHorizon] = useState<Horizon>('quarter');
  const {
    loading,
    nowMs,
    todayStart,
    startBalance,
    events,
    forecast,
    goalReserved,
    goalBreakdown,
    safeToSpendRaw,
    safeToSpend,
    safeToSpendPerDay,
    reload
  } = useForecast(HORIZON_DAYS[horizon]);

  const outflowEvents = useMemo(() => events.filter((e) => e.direction === 'out'), [events]);

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
    goalReserved,
    goalBreakdown,
    safeToSpendRaw,
    safeToSpend,
    safeToSpendPerDay,
    nowMs,
    reload
  };
}
