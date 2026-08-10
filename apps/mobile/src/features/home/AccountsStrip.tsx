import { View, Pressable, ScrollView, Text } from 'react-native';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePrivacy } from '~/context/PrivacyContext';
import { formatCurrency } from '@/lib/formatters';
import { Icon } from '~/components/Icon';
import { IconBadge } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import type { AccountBalance } from './useHome';

// Web: both the "Manage" header link and each account tile navigate(PATHS.app.accounts) — same
// destination either way, so both taps below just push the real `Accounts` route.
export function AccountsStrip({ accounts }: { accounts: AccountBalance[] }) {
  const { shouldMask } = usePrivacy();
  const theme = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const goToAccounts = () => navigation.navigate('Accounts');
  const anyNeedsAttention = accounts.some((a) => a.needsAttention);

  return (
    <View>
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-1.5">
          <Text className="text-xs font-medium text-tertiary">Accounts</Text>
          {/* Header-level echo of the per-tile indicator below (2026-08-10) — the strip scrolls
           *  horizontally, so a flagged tile can sit off-screen; this stays visible regardless of scroll
           *  position, which is the whole point of putting this on a screen seen every day. Same icon/
           *  color as the Accounts screen's own "Unverified" badge, per the design guidelines' "keep
           *  shared controls in sync" rule — just icon-only here, no room for the label text. */}
          {anyNeedsAttention && <Icon name="ti-alert-triangle" size={11} color={theme.danger} />}
        </View>
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
            <View className="flex-row items-center justify-between">
              <IconBadge icon={acc.icon} color={acc.color} bg={acc.color + '22'} size="sm" />
              {acc.needsAttention && (
                <View
                  className="w-4 h-4 rounded-full items-center justify-center"
                  style={{ backgroundColor: tint(theme.danger, 20) }}
                >
                  <Icon name="ti-alert-triangle" size={9} color={theme.danger} />
                </View>
              )}
            </View>
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
