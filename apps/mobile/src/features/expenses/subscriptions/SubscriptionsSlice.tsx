import { ScrollView } from 'react-native';
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
    addSubscription
  } = useSubscriptions(expenses);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 96 }}>
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
      />
    </ScrollView>
  );
}
