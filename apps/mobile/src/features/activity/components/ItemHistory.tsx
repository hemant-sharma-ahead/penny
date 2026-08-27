import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { activityLogRepo } from '@/core/db/repositories';
import type { ActivityLog } from '@/core/db/types';
import { usePrivacy } from '~/context/PrivacyContext';
import { maskAmounts } from '@/lib/maskAmounts';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { getActionMeta } from '../activityMeta';

interface Props {
  entityId: string;
}

function when(ts: number): string {
  return new Date(ts).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * RN port of apps/web-react/src/features/activity/components/ItemHistory.tsx — compact change history
 * for a single record, dropped onto per-item edit screens. Wired into `ExpenseForm.tsx`.
 */
export function ItemHistory({ entityId }: Props) {
  const { shouldMask } = usePrivacy();
  const theme = useThemeColors();
  const masked = shouldMask(false);
  const [entries, setEntries] = useState<ActivityLog[]>([]);

  useEffect(() => {
    let cancelled = false;
    activityLogRepo.getAll().then((all) => {
      if (cancelled) return;
      setEntries(all.filter((e) => e.entityId === entityId).sort((a, b) => b.timestamp - a.timestamp));
    });
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  if (entries.length === 0) return null;

  const meta = getActionMeta(theme);

  return (
    <View>
      <Text className="text-xs font-medium text-secondary mb-1.5">History</Text>
      <View className="gap-1.5">
        {entries.map((e) => {
          const m = meta[e.action];
          return (
            <View key={e.id} className="flex-row items-center gap-2">
              <Icon name={m.icon} size={13} color={m.color} />
              <Text className="text-[11px] text-secondary flex-1 min-w-0" numberOfLines={1}>
                {maskAmounts(e.summary, masked)}
              </Text>
              <Text className="text-[10px] text-tertiary flex-shrink-0">{when(e.timestamp)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
