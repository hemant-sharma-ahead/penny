import type { Expense } from '@/core/db/types';
import { useSubscriptions } from '~/features/subscriptions/useSubscriptions';
import { SubscriptionsView } from '~/features/subscriptions/SubscriptionsView';

interface SubscriptionsSliceProps {
  expenses: Expense[];
  masked: boolean;
}

export function SubscriptionsSlice({ expenses, masked }: SubscriptionsSliceProps) {
  const {
    detectedSubs,
    activeSubs,
    subsMonthlyTotal,
    subsAnnualTotal,
    confirmSubscription,
    dismissSubscription,
    cancelSubscription,
    addSubscription,
    reload
  } = useSubscriptions(expenses);

  // SubscriptionsView owns its own scrollable container (incl. pull-to-refresh) — no ScrollView
  // wrapper here, to avoid nesting scroll containers. This slice sits above the Expenses tab bar/FAB
  // chrome, hence the taller bottom padding vs. the standalone SubscriptionsPage.
  return (
    <SubscriptionsView
      detected={detectedSubs}
      active={activeSubs}
      monthlyTotal={subsMonthlyTotal}
      annualTotal={subsAnnualTotal}
      hasExpenses={expenses.length > 0}
      masked={masked}
      onConfirm={confirmSubscription}
      onDismiss={dismissSubscription}
      onCancel={cancelSubscription}
      onAdd={addSubscription}
      reload={reload}
      contentBottomPadding={96}
    />
  );
}
