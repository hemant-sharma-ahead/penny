import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Account } from '@/core/db/types';
import { usePrivacy } from '~/context/PrivacyContext';
import { Button, PageHeader } from '~/components/ui';
import { useAccounts } from './useAccounts';
import { useAccountForm } from '~/hooks/useAccountForm';
import { AccountList } from './AccountList';
import { PaymentModesSection } from './PaymentModesSection';
import { AccountFormModal } from '~/components/shared';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';
import type { HomeStackParamList } from '~/navigation/HomeStack';

export function AccountsPage() {
  const modeBg = useModeBackgroundColor();
  const { shouldMask } = usePrivacy();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { accounts, txns, saving, totalBalance, saveAccount, deleteAccount, reconcileAccount, categoryMap, hashtags } =
    useAccounts();
  const form = useAccountForm(saveAccount, accounts);
  useDefaultHeaderBack('Accounts');

  function handleImport(acc: Account) {
    navigation.navigate('BankImport', { accountId: acc.id });
  }

  // Zero-account empty state's "or import a bank statement" — creates the account as `'bank'` (no
  // type-picker step) and, once saved, hands off straight into Bank Import's setup screen for it,
  // instead of leaving the user back on an empty Accounts list to find the row-level import action
  // themselves (which doesn't exist yet, since there's no row).
  function handleImportOnboarding() {
    form.openAddWithType('bank', (acc) => {
      navigation.navigate('BankImport', { accountId: acc.id });
    });
  }

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader
        actions={
          <View className="flex-row gap-2">
            <Button
              variant="ghost"
              icon="ti-adjustments-horizontal"
              accessibilityLabel="Merchant recognition settings"
              className="w-8 h-8 rounded-lg"
              onPress={() => navigation.navigate('BankImportOverrides')}
            />
            <Button
              variant="ghost"
              icon="ti-cash"
              accessibilityLabel="Cash-withdrawal code settings"
              className="w-8 h-8 rounded-lg"
              onPress={() => navigation.navigate('BankCashWithdrawalCodes')}
            />
            <Button
              variant="primary"
              icon="ti-plus"
              accessibilityLabel="Add account"
              className="w-8 h-8 rounded-lg"
              onPress={form.openAdd}
            />
          </View>
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
          onImport={handleImport}
          onImportOnboarding={handleImportOnboarding}
          deleteAccount={deleteAccount}
          reconcileAccount={reconcileAccount}
        />
        <PaymentModesSection />
      </ScrollView>

      {form.showForm && <AccountFormModal form={form} saving={saving} />}
    </SafeAreaView>
  );
}
