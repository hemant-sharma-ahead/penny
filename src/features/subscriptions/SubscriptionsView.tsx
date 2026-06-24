import { useState } from 'react';
import { TabStrip, DetailRow } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import type { Subscription } from '@/core/db/types';
import type { DetectedSubscription } from '@/core/subscriptions/detector';
import { DetectedSubCard } from './DetectedSubCard';
import { ActiveSubCard } from './ActiveSubCard';

interface SubscriptionsViewProps {
  detected: DetectedSubscription[];
  active: Subscription[];
  monthlyTotal: number;
  hasExpenses: boolean;
  mode: 'open' | 'safe' | 'privacy';
  onConfirm: (c: DetectedSubscription) => void;
  onDismiss: (c: DetectedSubscription) => void;
  onCancel: (sub: Subscription) => void;
}

/** Shared subscriptions body: detected/active sub-tabs, lists, empty states, monthly summary. */
export function SubscriptionsView({
  detected,
  active,
  monthlyTotal,
  hasExpenses,
  mode,
  onConfirm,
  onDismiss,
  onCancel
}: SubscriptionsViewProps) {
  const [tab, setTab] = useState<'detected' | 'active'>('detected');

  return (
    <>
      <TabStrip
        options={[
          { value: 'detected', label: `Detected (${detected.length})` },
          { value: 'active', label: `Active (${active.length})` }
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'detected' && (
        <div className="px-4 py-4 flex flex-col gap-3">
          {detected.length === 0 ? (
            <div className="p-10 text-center">
              <i className="ti ti-refresh text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
              <p className="text-sm font-medium text-secondary mt-3">No new subscriptions detected</p>
              <p className="text-xs text-tertiary mt-1">
                {!hasExpenses
                  ? 'Add expenses first — recurring patterns will surface here.'
                  : 'All detected subscriptions have been reviewed.'}
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-tertiary">
                Found {detected.length} recurring pattern{detected.length !== 1 ? 's' : ''} in your expenses. Confirm
                ones you recognise.
              </p>
              {detected.map((c) => (
                <DetectedSubCard
                  key={`${c.merchantCategory}:${c.intervalDays}`}
                  candidate={c}
                  mode={mode}
                  onConfirm={onConfirm}
                  onDismiss={onDismiss}
                />
              ))}
            </>
          )}
        </div>
      )}

      {tab === 'active' && (
        <div className="px-4 py-4 flex flex-col gap-3">
          {active.length === 0 ? (
            <div className="p-10 text-center">
              <i className="ti ti-checklist text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
              <p className="text-sm font-medium text-secondary mt-3">No active subscriptions</p>
              <p className="text-xs text-tertiary mt-1">
                Confirm detected subscriptions to track your recurring costs here.
              </p>
            </div>
          ) : (
            <>
              <DetailRow
                label="Monthly spend"
                value={mode === 'open' ? formatCurrency(monthlyTotal) : '••••'}
                size="md"
              />
              {active.map((sub) => (
                <ActiveSubCard key={sub.id} sub={sub} mode={mode} onCancel={onCancel} />
              ))}
            </>
          )}
        </div>
      )}
    </>
  );
}
