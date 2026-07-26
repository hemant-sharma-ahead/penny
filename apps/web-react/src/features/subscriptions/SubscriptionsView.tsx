import { useState } from 'react';
import { TabStrip, DetailRow, Button } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import type { Subscription } from '@/core/db/types';
import type { DetectedSubscription } from '@/core/subscriptions/detector';
import { DetectedSubCard } from './DetectedSubCard';
import { ActiveSubCard } from './ActiveSubCard';
import { SubscriptionForm } from './SubscriptionForm';
import type { ManualSubscription } from './useSubscriptions';

interface SubscriptionsViewProps {
  detected: DetectedSubscription[];
  active: Subscription[];
  monthlyTotal: number;
  annualTotal: number;
  hasExpenses: boolean;
  masked: boolean;
  onConfirm: (c: DetectedSubscription) => void;
  onDismiss: (c: DetectedSubscription) => void;
  onCancel: (sub: Subscription) => void;
  onAdd: (sub: ManualSubscription) => void;
}

/** Shared subscriptions body: detected/active sub-tabs, lists, empty states, monthly + annual summary. */
export function SubscriptionsView({
  detected,
  active,
  monthlyTotal,
  annualTotal,
  hasExpenses,
  masked,
  onConfirm,
  onDismiss,
  onCancel,
  onAdd
}: SubscriptionsViewProps) {
  const [tab, setTab] = useState<'detected' | 'active'>('detected');
  const [nowMs] = useState(() => Date.now());
  const [showAdd, setShowAdd] = useState(false);

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
                  masked={masked}
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
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-primary">Active subscriptions</p>
            <Button variant="secondary" size="sm" icon="ti-plus" onClick={() => setShowAdd(true)}>
              Add
            </Button>
          </div>
          {active.length === 0 ? (
            <div className="p-10 text-center">
              <i className="ti ti-checklist text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
              <p className="text-sm font-medium text-secondary mt-3">No active subscriptions</p>
              <p className="text-xs text-tertiary mt-1">
                Confirm detected subscriptions, or add one manually to track your recurring costs.
              </p>
            </div>
          ) : (
            <>
              <div className="surface rounded-xl px-4 py-1">
                <DetailRow label="Monthly spend" value={!masked ? formatCurrency(monthlyTotal) : '••••'} size="md" />
                <DetailRow label="Yearly spend" value={!masked ? formatCurrency(annualTotal) : '••••'} size="md" />
              </div>
              {active.map((sub) => (
                <ActiveSubCard key={sub.id} sub={sub} nowMs={nowMs} masked={masked} onCancel={onCancel} />
              ))}
            </>
          )}
        </div>
      )}

      {showAdd && <SubscriptionForm onAdd={onAdd} onClose={() => setShowAdd(false)} />}
    </>
  );
}
