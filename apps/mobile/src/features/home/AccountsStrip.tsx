import { View, Pressable, ScrollView, Text } from 'react-native';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePrivacy } from '~/context/PrivacyContext';
import { formatCurrency } from '@/lib/formatters';
import { IconBadge } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import type { AccountBalance } from './useHome';

// Web: both the "Manage" header link and each account tile navigate(PATHS.app.accounts) — same
// destination either way, so both taps below just push the real `Accounts` route.
export function AccountsStrip({ accounts }: { accounts: AccountBalance[] }) {
  const { shouldMask } = usePrivacy();
  const theme = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const goToAccounts = () => navigation.navigate('Accounts');

  return (
    <View>
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-xs font-medium text-tertiary">Accounts</Text>
        <Pressable onPress={goToAccounts} hitSlop={8}>
          <Text className="text-xs font-semibold" style={{ color: theme.primary }}>
            Manage →
          </Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-4"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
      >
        {accounts.map((acc) => (
          <Pressable
            key={acc.id}
            onPress={goToAccounts}
            className="bg-surface border border-theme rounded-2xl px-3.5 py-3 gap-1 active:opacity-70"
            style={{ minWidth: 120 }}
          >
            <IconBadge icon={acc.icon} color={acc.color} bg={acc.color + '22'} size="sm" />
            <Text className="text-[11px] font-medium text-secondary mt-0.5" numberOfLines={1}>
              {acc.name}
            </Text>
            <Text className="text-sm font-bold text-primary">
              {shouldMask(acc.hideInSafeMode) ? '••••' : formatCurrency(acc.balance)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
