import { View, Text, Pressable } from 'react-native';
import type { ActivityLog } from '@/core/db/types';
import { maskAmounts } from '@/lib/maskAmounts';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { getActionMeta } from '../activityMeta';
import { DiffChips } from './DiffChips';

interface Props {
  entry: ActivityLog;
  masked: boolean;
  onRestore?: (id: string) => void;
  restoring?: boolean;
}

function timeOf(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

/** RN port of apps/web-legacy/src/features/activity/components/ActivityRow.tsx. */
export function ActivityRow({ entry, masked, onRestore, restoring }: Props) {
  const theme = useThemeColors();
  const meta = getActionMeta(theme)[entry.action];
  return (
    <View className="flex-row items-start gap-3 px-4 py-3">
      <View
        className="w-8 h-8 rounded-lg items-center justify-center flex-shrink-0 mt-0.5"
        style={{ backgroundColor: `${meta.color}18` }}
      >
        <Icon name={meta.icon} size={16} color={meta.color} />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-sm text-primary leading-snug">{maskAmounts(entry.summary, masked)}</Text>
        {entry.diff && <DiffChips diff={entry.diff} masked={masked} />}
        <Text className="text-[10px] text-tertiary mt-0.5">{timeOf(entry.timestamp)}</Text>
      </View>
      {onRestore && (
        <Pressable
          onPress={() => onRestore(entry.id)}
          disabled={restoring}
          className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-surface-2"
          style={{ opacity: restoring ? 0.5 : 1 }}
        >
          <Text className="text-xs font-semibold" style={{ color: theme.primary }}>
            Restore
          </Text>
        </Pressable>
      )}
    </View>
  );
}
