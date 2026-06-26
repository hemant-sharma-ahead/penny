import { usePrivacy } from '@/context/PrivacyContext';
import { expensesRepo } from '@/core/db/repositories';
import { useRepository } from '@/hooks/useRepository';
import { formatCurrency } from '@/lib/formatters';
import { PageHeader } from '@/components/ui';
import { useSubscriptions } from './useSubscriptions';
import { SubscriptionsView } from './SubscriptionsView';

export function SubscriptionsPage() {
  const { mode } = usePrivacy();
  const { items: expenses } = useRepository(expensesRepo);
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
    <div className="flex flex-col h-full">
      <PageHeader
        title="Subscriptions"
        subtitle={
          activeSubs.length > 0
            ? `${mode === 'open' ? formatCurrency(subsMonthlyTotal) : '••••'}/month total`
            : undefined
        }
      />

      <div className="flex-1 overflow-y-auto pb-6">
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
    </div>
  );
}
