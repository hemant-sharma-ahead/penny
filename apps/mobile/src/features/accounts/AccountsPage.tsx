import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivacy } from '~/context/PrivacyContext';
import { Button, PageHeader } from '~/components/ui';
import { BackButton } from '~/components/shared';
import { useAccounts } from './useAccounts';
import { useAccountForm } from './useAccountForm';
import { AccountList } from './AccountList';
import { AccountFormModal } from './AccountFormModal';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';

export function AccountsPage() {
  const modeBg = useModeBackgroundColor();
  const { shouldMask } = usePrivacy();
  const { accounts, txns, saving, totalBalance, saveAccount, deleteAccount, reconcileAccount } = useAccounts();
  const form = useAccountForm(saveAccount, accounts);

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader
        leading={<BackButton />}
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
