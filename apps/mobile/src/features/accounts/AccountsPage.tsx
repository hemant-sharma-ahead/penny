import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivacy } from '~/context/PrivacyContext';
import { Button, PageHeader } from '~/components/ui';
import { useAccounts } from './useAccounts';
import { useAccountForm } from './useAccountForm';
import { AccountList } from './AccountList';
import { AccountFormModal } from './AccountFormModal';

/** RN port note: back button dropped for now — see docs/plans/mobile-migration.md's Track 4 progress log
 *  (same reasoning as InsurancePage/LoanScenariosPage/IouPage). */
export function AccountsPage() {
  const { shouldMask } = usePrivacy();
  const { accounts, txns, saving, totalBalance, saveAccount, deleteAccount, reconcileAccount } = useAccounts();
  const form = useAccountForm(saveAccount);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-tertiary">
      <PageHeader
        title="Accounts"
        actions={
          <Button
            variant="primary"
            icon="ti-plus"
            accessibilityLabel="Add account"
            className="w-8 h-8 rounded-lg"
            onPress={form.openAdd}
          />
        }
      />

      <ScrollView className="flex-1">
        <AccountList
          accounts={accounts}
          txns={txns}
          totalBalance={totalBalance}
          shouldMask={shouldMask}
          onAdd={form.openAdd}
          onEdit={form.openEdit}
          deleteAccount={deleteAccount}
          reconcileAccount={reconcileAccount}
        />
      </ScrollView>

      {form.showForm && <AccountFormModal form={form} saving={saving} />}
    </SafeAreaView>
  );
}
