import type { Account, Expense, ExpenseCategory, Hashtag } from '@/core/db/types';
import { useSubscriptions } from '~/features/subscriptions/useSubscriptions';
import { SubscriptionsView } from '~/features/subscriptions/SubscriptionsView';

interface SubscriptionsSliceProps {
  expenses: Expense[];
  categoryMap: Map<string, ExpenseCategory>;
  accountMap: Map<string, Account>;
  hashtags: Hashtag[];
  shouldMask: (sensitive: boolean | undefined) => boolean;
  masked: boolean;
}

export function SubscriptionsSlice({
  expenses,
  categoryMap,
  accountMap,
  hashtags,
  shouldMask,
  masked
}: SubscriptionsSliceProps) {
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
      expenses={expenses}
      categoryMap={categoryMap}
      accountMap={accountMap}
      hashtags={hashtags}
      shouldMask={shouldMask}
    />
  );
}
