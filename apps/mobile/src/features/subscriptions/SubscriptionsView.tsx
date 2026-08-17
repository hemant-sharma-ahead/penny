import { useState } from 'react';
import { View, ScrollView, RefreshControl, Text } from 'react-native';
import { TabStrip, DetailRow, Button, EmptyState } from '~/components/ui';
import { formatCurrency } from '@/lib/formatters';
import type { Subscription } from '@/core/db/types';
import type { DetectedSubscription } from '@/core/subscriptions/detector';
import { useThemeColors } from '~/theme/useThemeColors';
import { usePullToRefresh } from '~/hooks/usePullToRefresh';
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
  /** This component's own `useSubscriptions(expenses)` reload — never the caller's `expenses` source
   *  (that's `useExpenses()` in a different feature and out of scope for this shared view). */
  reload: () => unknown;
  /** Bottom padding for the owned scroll container — callers differ (standalone page vs. an Expenses
   *  sub-tab sitting above other chrome), so this stays caller-supplied rather than hardcoded here. */
  contentBottomPadding?: number;
}

/** Shared subscriptions body: detected/active sub-tabs, lists, empty states, monthly + annual summary.
 *  Owns its own scrollable container (rather than relying on each caller's own `ScrollView`) so that
 *  pull-to-refresh is wired exactly once here — this component is rendered from both
 *  `SubscriptionsPage.tsx` (standalone) and `SubscriptionsSlice.tsx` (Expenses sub-tab) as the same
 *  instance, and duplicating the wiring in each caller would be redundant (and risk a nested
 *  `ScrollView`). */
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
  onAdd,
  reload,
  contentBottomPadding = 24
}: SubscriptionsViewProps) {
  const theme = useThemeColors();
  const [tab, setTab] = useState<'detected' | 'active'>('detected');
  const [nowMs] = useState(() => Date.now());
  const [showAdd, setShowAdd] = useState(false);
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingBottom: contentBottomPadding }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
    >
      <TabStrip
        options={[
          { value: 'detected', label: `Detected (${detected.length})` },
          { value: 'active', label: `Active (${active.length})` }
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'detected' && (
        <View className="px-4 py-4 gap-3">
          {detected.length === 0 ? (
            <EmptyState
              icon="ti-refresh"
              title="No new subscriptions detected"
              description={
                !hasExpenses
                  ? 'Add expenses first — recurring patterns will surface here.'
                  : 'All detected subscriptions have been reviewed.'
              }
            />
          ) : (
            <>
              <Text className="text-xs text-tertiary">
                Found {detected.length} recurring pattern{detected.length !== 1 ? 's' : ''} in your expenses. Confirm
                ones you recognise.
              </Text>
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
        </View>
      )}

      {tab === 'active' && (
        <View className="px-4 py-4 gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-primary">Active subscriptions</Text>
            <Button variant="secondary" size="sm" icon="ti-plus" onPress={() => setShowAdd(true)}>
              Add
            </Button>
          </View>
          {active.length === 0 ? (
            <EmptyState
              icon="ti-checklist"
              title="No active subscriptions"
              description="Confirm detected subscriptions, or add one manually to track your recurring costs."
            />
          ) : (
            <>
              <View className="bg-surface border border-theme rounded-xl px-4 py-1">
                <DetailRow label="Monthly spend" value={!masked ? formatCurrency(monthlyTotal) : '••••'} size="md" />
                <DetailRow label="Yearly spend" value={!masked ? formatCurrency(annualTotal) : '••••'} size="md" />
              </View>
              {active.map((sub) => (
                <ActiveSubCard key={sub.id} sub={sub} nowMs={nowMs} masked={masked} onCancel={onCancel} />
              ))}
            </>
          )}
        </View>
      )}

      {showAdd && <SubscriptionForm onAdd={onAdd} onClose={() => setShowAdd(false)} />}
    </ScrollView>
  );
}
