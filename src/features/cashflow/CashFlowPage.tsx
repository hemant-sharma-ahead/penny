import { usePrivacy } from '@/context/PrivacyContext';
import { formatCurrency } from '@/lib/formatters';
import { Card, EmptyState, SegmentedControl } from '@/components/ui';
import { useCashFlow } from './useCashFlow';
import { CashFlowTimeline } from './CashFlowTimeline';

export function CashFlowPage() {
  const { mode } = usePrivacy();
  const { horizon, setHorizon, loading, grouped, total, summaryParts, todayStart } = useCashFlow();

  const horizonLabel = horizon === 'week' ? 'this week' : 'this month';
  const displayTotal = mode === 'open' ? formatCurrency(total) : '••••';

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-primary">Cash Flow</h2>
        <div className="w-36">
          <SegmentedControl
            options={[
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' }
            ]}
            value={horizon}
            onChange={setHorizon}
          />
        </div>
      </div>

      {/* Summary card */}
      <div className="rounded-2xl p-5 text-white" style={{ backgroundColor: 'var(--color-primary)' }}>
        <p className="text-sm opacity-75 mb-1">Total outflow {horizonLabel}</p>
        <p className="text-3xl font-semibold tracking-tight">{displayTotal}</p>
        {summaryParts.length > 0 ? (
          <p className="text-sm opacity-70 mt-1">{summaryParts.join(' · ')}</p>
        ) : (
          !loading && <p className="text-sm opacity-70 mt-1">No upcoming payments</p>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl h-16 animate-pulse bg-surface-2" />
          ))}
        </div>
      )}

      {/* Timeline */}
      {!loading && grouped.length > 0 && <CashFlowTimeline grouped={grouped} todayStart={todayStart} mode={mode} />}

      {/* Empty state */}
      {!loading && grouped.length === 0 && (
        <Card radius="md" className="text-center">
          <EmptyState
            icon="ti-calendar-check"
            title="No upcoming payments"
            description="Add loans, subscriptions, or recurring expenses to see your cash flow forecast."
          />
        </Card>
      )}

      <p className="text-xs text-center leading-relaxed text-tertiary">
        Based on your loans, subscriptions, renewals, and recurring expenses. Actual amounts may vary.
      </p>
    </div>
  );
}
