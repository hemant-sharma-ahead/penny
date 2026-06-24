import { usePrivacy } from '@/context/PrivacyContext';
import { expensesRepo } from '@/core/db/repositories';
import { useRepository } from '@/hooks/useRepository';
import { formatCurrency } from '@/lib/formatters';
import { useSubscriptions } from './useSubscriptions';
import { SubscriptionsView } from './SubscriptionsView';

export function SubscriptionsPage() {
  const { mode } = usePrivacy();
  const { items: expenses } = useRepository(expensesRepo);
  const { detectedSubs, activeSubs, subsMonthlyTotal, confirmSubscription, dismissSubscription, cancelSubscription } =
    useSubscriptions(expenses);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-theme">
        <h2 className="text-xl font-semibold text-primary">Subscriptions</h2>
        {activeSubs.length > 0 && (
          <p className="text-sm text-secondary mt-0.5">
            {mode === 'open' ? formatCurrency(subsMonthlyTotal) : '••••'}/month total
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        <SubscriptionsView
          detected={detectedSubs}
          active={activeSubs}
          monthlyTotal={subsMonthlyTotal}
          hasExpenses={expenses.length > 0}
          mode={mode}
          onConfirm={confirmSubscription}
          onDismiss={dismissSubscription}
          onCancel={cancelSubscription}
        />
      </div>
    </div>
  );
}
