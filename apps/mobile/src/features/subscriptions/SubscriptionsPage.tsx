import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivacy } from '~/context/PrivacyContext';
import { useSettings } from '~/context/SettingsContext';
import { expensesRepo } from '@/core/db/repositories';
import { useRepository } from '@/hooks/useRepository';
import { formatCurrency } from '@/lib/formatters';
import { PageHeader } from '~/components/ui';
import { useSubscriptions } from './useSubscriptions';
import { SubscriptionsView } from './SubscriptionsView';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';

export function SubscriptionsPage() {
  const modeBg = useModeBackgroundColor();
  const { shouldMask } = usePrivacy();
  const { safeModeVisibility } = useSettings();
  const masked = shouldMask(!safeModeVisibility.subscriptions);
  const { items: expenses } = useRepository(expensesRepo);
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
  useDefaultHeaderBack('Subscriptions');

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader
        subtitle={
          activeSubs.length > 0 ? `${masked ? '••••' : formatCurrency(subsMonthlyTotal)}/month total` : undefined
        }
      />

      {/* SubscriptionsView owns its own scrollable container (incl. pull-to-refresh) — no ScrollView
          wrapper here, to avoid nesting scroll containers. */}
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
      />
    </SafeAreaView>
  );
}
