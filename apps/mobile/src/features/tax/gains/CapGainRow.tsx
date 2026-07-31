import { View, Text } from 'react-native';
import type { CapGainItem } from '@/core/tax/calculator';
import { formatCurrency } from '@/lib/formatters';
import { useThemeColors } from '~/theme/useThemeColors';

/** RN port of apps/web-react/src/features/tax/gains/CapGainRow.tsx — a single holding's
 *  realised/unrealised gain row with long-term progress and estimated tax. */
export function CapGainRow({ item }: { item: CapGainItem }) {
  const theme = useThemeColors();
  const isGain = item.gain > 0;
  const isLoss = item.gain < 0;
  const daysToLT = item.ltThresholdDays - item.holdingDays;
  const gainColor = isGain ? theme.success : isLoss ? theme.danger : theme.neutral;

  return (
    <View className="rounded-xl p-3 bg-surface border border-theme">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1">
          <Text className="text-sm font-medium text-primary" numberOfLines={1}>
            {item.name}
          </Text>
          <Text className="text-[11px] mt-0.5 text-tertiary">
            {item.assetClass.toUpperCase()} · {item.holdingDays}d held ·{' '}
            {item.isLongTerm ? (
              <Text className="font-medium" style={{ color: theme.success }}>
                Long-term
              </Text>
            ) : daysToLT > 0 ? (
              <Text className="font-medium" style={{ color: theme.warning }}>
                {daysToLT}d to long-term
              </Text>
            ) : (
              <Text className="text-secondary">Short-term</Text>
            )}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-sm font-semibold" style={{ color: gainColor }}>
            {isGain ? '+' : ''}
            {formatCurrency(Math.abs(item.gain))}
          </Text>
          <Text className="text-[10px] text-tertiary">
            {item.gainPct >= 0 ? '+' : ''}
            {item.gainPct.toFixed(1)}%
          </Text>
        </View>
      </View>

      {item.gain > 0 && item.taxRatePct !== null && (
        <View className="mt-2 pt-2 flex-row items-center justify-between border-t border-theme">
          <Text className="text-[10px] text-tertiary">
            Est. tax @ {item.taxRatePct}%
            {!item.isLongTerm && item.assetClass === 'stock' ? ' (STCG)' : item.isLongTerm ? ' (LTCG)' : ''}
          </Text>
          <Text className="text-[11px] font-semibold text-secondary">
            {item.estimatedTax !== null ? formatCurrency(Math.round(item.estimatedTax)) : 'At slab rate'}
          </Text>
        </View>
      )}
      {item.gain > 0 && item.taxRatePct === null && (
        <View className="mt-2 pt-2 border-t border-theme">
          <Text className="text-[10px] text-tertiary">Taxed at your income slab rate</Text>
        </View>
      )}
    </View>
  );
}
