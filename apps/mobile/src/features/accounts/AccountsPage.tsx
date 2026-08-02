import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivacy } from '~/context/PrivacyContext';
import { Button, PageHeader } from '~/components/ui';
import { useAccounts } from './useAccounts';
import { useAccountForm } from '~/hooks/useAccountForm';
import { AccountList } from './AccountList';
import { AccountFormModal } from '~/components/shared';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';

export function AccountsPage() {
  const modeBg = useModeBackgroundColor();
  const { shouldMask } = usePrivacy();
  const { accounts, txns, saving, totalBalance, saveAccount, deleteAccount, reconcileAccount, categoryMap, hashtags } =
    useAccounts();
  const form = useAccountForm(saveAccount, accounts);
  useDefaultHeaderBack('Accounts');

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader
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
          categoryMap={categoryMap}
          hashtags={hashtags}
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
