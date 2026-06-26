import type { Expense } from '@/core/db/types';
import { useSubscriptions } from '@/features/subscriptions/useSubscriptions';
import { SubscriptionsView } from '@/features/subscriptions/SubscriptionsView';

interface SubscriptionsSliceProps {
  expenses: Expense[];
  mode: 'open' | 'safe' | 'privacy';
}

export function SubscriptionsSlice({ expenses, mode }: SubscriptionsSliceProps) {
  const {
    detectedSubs,
    activeSubs,
    subsMonthlyTotal,
    subsAnnualTotal,
    confirmSubscription,
    dismissSubscription,
    cancelSubscription,
    addSubscription
  } = useSubscriptions(expenses);

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      <SubscriptionsView
        detected={detectedSubs}
        active={activeSubs}
        monthlyTotal={subsMonthlyTotal}
        annualTotal={subsAnnualTotal}
        hasExpenses={expenses.length > 0}
        mode={mode}
        onConfirm={confirmSubscription}
        onDismiss={dismissSubscription}
        onCancel={cancelSubscription}
        onAdd={addSubscription}
      />
    </div>
  );
}
