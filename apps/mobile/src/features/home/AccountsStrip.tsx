import { View, Text, Pressable, ScrollView } from 'react-native';
import { usePrivacy } from '~/context/PrivacyContext';
import { formatCurrency } from '@/lib/formatters';
import { IconBadge } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import type { AccountBalance } from './useHome';

// No real nav stack yet (same reasoning as every module's dropped back button) — "Manage" and the
// account tiles are inert until Home is wired into real navigation.
export function AccountsStrip({ accounts }: { accounts: AccountBalance[] }) {
  const { shouldMask } = usePrivacy();
  const theme = useThemeColors();

  return (
    <View>
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-xs font-medium text-tertiary">Accounts</Text>
        <Pressable onPress={() => {}} hitSlop={8}>
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
            onPress={() => {}}
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
