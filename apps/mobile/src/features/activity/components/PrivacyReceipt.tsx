import { useMemo } from 'react';
import { View, Text } from 'react-native';
import type { ActivityLog } from '@/core/db/types';
import { startOfToday } from '@/lib/date';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

interface Props {
  entries: ActivityLog[];
}

/** RN port of apps/web-legacy/src/features/activity/components/PrivacyReceipt.tsx — slim one-line
 *  privacy note at the top of the Timeline feed. */
export function PrivacyReceipt({ entries }: Props) {
  const theme = useThemeColors();
  const todayCount = useMemo(() => {
    const since = startOfToday();
    return entries.filter((e) => e.timestamp >= since).length;
  }, [entries]);

  return (
    <View className="flex-row items-center gap-2 px-4 py-2.5 border-b border-theme">
      <Icon name="ti-lock-check" size={14} color={theme.info} />
      <Text className="text-xs text-secondary">
        <Text className="font-semibold text-primary">{todayCount}</Text> change{todayCount === 1 ? '' : 's'} today — all
        stayed on your device.
      </Text>
    </View>
  );
}
