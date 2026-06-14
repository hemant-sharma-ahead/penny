import { useEffect, useMemo, useState } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import { expensesRepo, insurancePoliciesRepo, liabilitiesRepo, subscriptionsRepo } from '@/core/db/repositories';
import { forecastEvents } from '@/core/cashflow/forecaster';
import type { CashFlowEvent, CashFlowType } from '@/core/cashflow/forecaster';
import type { Expense, InsurancePolicy, Liability, Subscription } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';

type Horizon = 'week' | 'month';

const HORIZON_DAYS: Record<Horizon, number> = { week: 7, month: 31 };

const TYPE_CONFIG: Record<CashFlowType, { icon: string; color: string; label: string }> = {
  loan_emi: { icon: 'ti-building-bank', color: '#3b82f6', label: 'Loan EMI' },
  subscription: { icon: 'ti-refresh', color: '#8b5cf6', label: 'Subscription' },
  insurance: { icon: 'ti-shield', color: '#10b981', label: 'Insurance' },
  recurring: { icon: 'ti-repeat', color: '#f59e0b', label: 'Recurring' }
};

const CF_TYPES: CashFlowType[] = ['loan_emi', 'subscription', 'insurance', 'recurring'];

interface LoadedData {
  liabilities: Liability[];
  subscriptions: Subscription[];
  policies: InsurancePolicy[];
  expenses: Expense[];
}

function formatGroupDate(dueMs: number, todayStart: number): string {
  const diffDays = Math.round((dueMs - todayStart) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(dueMs));
}

export function CashFlowPage() {
  const { mode } = usePrivacy();
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

  const events = useMemo(() => {
    if (!data) return [] as CashFlowEvent[];
    return forecastEvents(
      data.liabilities,
      data.subscriptions,
      data.policies,
      data.expenses,
      nowMs,
      HORIZON_DAYS[horizon]
    );
  }, [data, nowMs, horizon]);

  const todayStart = useMemo(() => {
    const d = new Date(nowMs);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [nowMs]);

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

  const typeCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1;
    return counts;
  }, [events]);

  const summaryParts = useMemo(() => {
    return CF_TYPES.filter((t) => (typeCount[t] ?? 0) > 0).map((t) => {
      const cnt = typeCount[t] ?? 0;
      const cfg = TYPE_CONFIG[t];
      return `${cnt} ${cfg.label.toLowerCase()}${cnt > 1 ? 's' : ''}`;
    });
  }, [typeCount]);

  const horizonLabel = horizon === 'week' ? 'this week' : 'this month';
  const displayTotal = mode === 'open' ? formatCurrency(total) : '••••';

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-primary">Cash Flow</h2>
        <div className="flex rounded-lg p-0.5 gap-0.5 bg-surface-2">
          {(['week', 'month'] as Horizon[]).map((h) => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
              style={
                horizon === h
                  ? {
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                    }
                  : { color: 'var(--color-text-secondary)' }
              }
            >
              {h === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary card */}
      <div className="rounded-2xl p-5 text-white" style={{ backgroundColor: 'var(--color-primary)' }}>
        <p className="text-sm opacity-75 mb-1">Total outflow {horizonLabel}</p>
        <p className="text-3xl font-semibold tracking-tight">{displayTotal}</p>
        {summaryParts.length > 0 ? (
          <p className="text-sm opacity-70 mt-1">{summaryParts.join(' · ')}</p>
        ) : (
          data !== null && <p className="text-sm opacity-70 mt-1">No upcoming payments</p>
        )}
      </div>

      {/* Loading skeleton */}
      {data === null && (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl h-16 animate-pulse bg-surface-2" />
          ))}
        </div>
      )}

      {/* Timeline */}
      {data !== null && grouped.length > 0 && (
        <div className="flex flex-col gap-4">
          {grouped.map(([dayMs, dayEvents]) => (
            <div key={dayMs}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
                  {formatGroupDate(dayMs, todayStart)}
                </span>
                <div className="flex-1 h-px bg-surface-2 border-t border-theme" />
                <span className="text-xs text-tertiary">
                  {mode === 'open' ? formatCurrency(dayEvents.reduce((s, e) => s + e.amount, 0)) : '••••'}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {dayEvents.map((event) => {
                  const cfg = TYPE_CONFIG[event.type];
                  return (
                    <div key={event.id} className="surface flex items-center gap-3 rounded-xl p-3">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${cfg.color}18` }}
                      >
                        <i className={`ti ${cfg.icon}`} style={{ fontSize: 18, color: cfg.color }} aria-hidden="true" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-primary">{event.label}</p>
                        <p className="text-xs text-tertiary">{cfg.label}</p>
                      </div>
                      <span className="text-sm font-semibold shrink-0 text-primary">
                        {mode === 'open' ? formatCurrency(event.amount) : '••••'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {data !== null && grouped.length === 0 && (
        <div className="rounded-xl p-8 text-center bg-surface-2 border border-theme">
          <i className="ti ti-calendar-check text-tertiary" style={{ fontSize: 40 }} aria-hidden="true" />
          <p className="text-sm font-medium mt-3 text-secondary">No upcoming payments</p>
          <p className="text-xs mt-1 leading-relaxed text-tertiary">
            Add loans, subscriptions, or recurring expenses to see your cash flow forecast.
          </p>
        </div>
      )}

      <p className="text-xs text-center leading-relaxed text-tertiary">
        Based on your loans, subscriptions, renewals, and recurring expenses. Actual amounts may vary.
      </p>
    </div>
  );
}
