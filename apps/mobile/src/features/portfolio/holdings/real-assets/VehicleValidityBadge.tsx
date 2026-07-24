import { View, Text } from 'react-native';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import { daysUntil } from '@/lib/date';

export function VehicleValidityBadge({ label, upto }: { label: string; upto: number }) {
  const theme = useThemeColors();
  const days = daysUntil(upto);
  const expired = days < 0;
  const soon = days >= 0 && days <= 30;
  const color = expired ? theme.danger : soon ? theme.warning : theme.success;
  const dateStr = new Date(upto).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
  return (
    <View className="flex-1 items-center px-2 py-1.5 rounded-xl" style={{ backgroundColor: tint(color, 8) }}>
      <Text className="text-[9px] text-tertiary">{label}</Text>
      <Text className="text-[10px] font-semibold tabular-nums" style={{ color }}>
        {expired ? 'Expired' : dateStr}
      </Text>
    </View>
  );
}
