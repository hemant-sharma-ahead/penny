import { View, Text } from 'react-native';
import { ProgressBar } from '~/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { useThemeColors } from '~/theme/useThemeColors';

interface DeductionBarProps {
  used: number;
  limit: number;
  label: string;
}

/** RN port of apps/web-react/src/features/tax/deductions/DeductionBar.tsx — a labelled
 *  deduction-utilisation bar with used/limit amounts and a "remaining" hint. */
export function DeductionBar({ used, limit, label }: DeductionBarProps) {
  const theme = useThemeColors();
  const pct = Math.min(100, (used / limit) * 100);
  const remaining = Math.max(0, limit - used);
  const color = pct >= 100 ? theme.success : pct >= 70 ? theme.warning : theme.primary;

  return (
    <View>
      <View className="flex-row items-baseline justify-between mb-1.5">
        <Text className="text-xs font-semibold text-primary">{label}</Text>
        <Text className="text-[11px] text-secondary">
          {formatCurrency(used)} / {formatCurrency(limit)}
        </Text>
      </View>
      <ProgressBar value={pct} color={color} size="md" animate />
      {remaining > 0 ? (
        <Text className="text-[10px] mt-1 text-tertiary">{formatCurrency(remaining)} remaining to invest this FY</Text>
      ) : (
        <Text className="text-[10px] mt-1 font-medium" style={{ color: theme.success }}>
          Limit fully utilised
        </Text>
      )}
    </View>
  );
}
