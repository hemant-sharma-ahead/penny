import { useMemo } from 'react';
import { View, Text } from 'react-native';
import type { ActivityLog } from '@/core/db/types';
import { maskAmounts } from '@/lib/maskAmounts';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

interface Props {
  entries: ActivityLog[];
  masked: boolean;
}

/** RN port of apps/web-react/src/features/activity/components/OnThisDay.tsx. */
export function OnThisDay({ entries, masked }: Props) {
  const theme = useThemeColors();
  const memories = useMemo(() => {
    const now = new Date();
    return entries
      .filter((e) => {
        const d = new Date(e.timestamp);
        return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() < now.getFullYear();
      })
      .slice(0, 3);
  }, [entries]);

  if (memories.length === 0) return null;

  return (
    <View className="rounded-2xl bg-surface p-4">
      <View className="flex-row items-center gap-2 mb-2">
        <Icon name="ti-calendar-heart" size={16} color={theme.primary} />
        <Text className="text-sm font-semibold text-primary">On this day</Text>
      </View>
      <View className="gap-1.5">
        {memories.map((e) => (
          <Text key={e.id} className="text-xs text-secondary">
            <Text className="text-tertiary">{new Date(e.timestamp).getFullYear()}: </Text>
            {maskAmounts(e.summary, masked)}
          </Text>
        ))}
      </View>
    </View>
  );
}
