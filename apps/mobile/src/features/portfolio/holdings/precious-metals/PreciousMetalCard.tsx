import { View, Text } from 'react-native';
import { Card, Badge } from '~/components/ui';
import { ListRow } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { goldPriceForKarat } from '@/core/metals/metalsClient';
import { formatCurrency } from '@/lib/formatters';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Holding } from '@/core/db/types';

const METAL_CATEGORY_LABEL: Record<string, string> = {
  jewellery: 'Jewellery',
  coin: 'Coin',
  bar: 'Bar',
  digital: 'Digital',
  other: 'Other'
};

// View card for a gold/silver holding — weight, karat/purity, live spot value and gain/loss.
export function PreciousMetalCard({
  holding,
  spotGold,
  spotSilver,
  onEdit,
  masked
}: {
  holding: Holding;
  spotGold: number | null;
  spotSilver: number | null;
  onEdit: () => void;
  masked: boolean;
}) {
  const theme = useThemeColors();
  const meta = holding.assetMeta ?? {};
  const isGold = meta.metalType !== 'silver';
  const weightGrams = meta.metalWeightGrams ?? holding.units ?? 0;
  const purchasePricePerGram = meta.metalPurchasePricePerGram ?? holding.avgCostPrice ?? 0;
  const karat = meta.metalKarat ?? 22;
  const purity = meta.metalPurity ?? '999';
  const category = meta.metalCategory ?? 'other';

  const spotPrice = isGold ? spotGold : spotSilver;
  const effectiveSpotPerGram =
    isGold && spotPrice ? goldPriceForKarat(spotPrice, karat as 14 | 18 | 22 | 24) : spotPrice;
  const currentValue = effectiveSpotPerGram
    ? weightGrams * effectiveSpotPerGram
    : (holding.currentValue ?? holding.investedAmount);
  const costBasis = weightGrams * purchasePricePerGram;
  const gainLoss = currentValue - costBasis;
  const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
  const gainColor = gainLoss >= 0 ? theme.primary : theme.danger;

  const iconColor = isGold ? '#d97706' : '#94a3b8';
  const iconBg = isGold ? '#d9780615' : '#94a3b815';
  const icon = isGold ? 'ti-circle-letter-g' : 'ti-circle-letter-s';

  const priceLabel = isGold
    ? `₹${Math.round(spotPrice ?? 0).toLocaleString('en-IN')}/g (24K)`
    : `₹${Math.round(spotPrice ?? 0).toLocaleString('en-IN')}/g`;

  return (
    <Card onPress={onEdit} padding="sm" className="flex-col gap-3">
      {/* Header */}
      <ListRow
        icon={icon}
        iconColor={iconColor}
        iconBg={iconBg}
        iconSize="sm"
        title={
          <Text className="text-sm font-semibold text-primary" numberOfLines={1}>
            {holding.name}
          </Text>
        }
        subtitle={
          <View className="flex-row items-center gap-1.5 flex-wrap">
            <Badge label={METAL_CATEGORY_LABEL[category] ?? category} color={iconColor} size="sm" />
            <Text className="text-[10px] text-secondary">
              {weightGrams}g · {isGold ? `${karat}K` : purity}
            </Text>
          </View>
        }
        right={<Icon name="ti-chevron-right" size={15} color={theme.textTertiary} />}
      />

      {/* Value row */}
      <View className="flex-row items-end justify-between">
        <View>
          <Text className="text-[10px] text-secondary">Current value</Text>
          <Text className="text-lg font-bold text-primary">{!masked ? formatCurrency(currentValue) : '••••'}</Text>
          {!masked && <Text className="text-[10px] text-secondary mt-0.5">Cost: {formatCurrency(costBasis)}</Text>}
        </View>
        {!masked && (
          <View className="items-end">
            <Text className="text-sm font-semibold" style={{ color: gainColor }}>
              {gainLoss >= 0 ? '+' : ''}
              {formatCurrency(gainLoss)}
            </Text>
            <Text className="text-[10px]" style={{ color: gainColor }}>
              {gainLoss >= 0 ? '▲' : '▼'} {Math.abs(gainLossPct).toFixed(1)}%
            </Text>
          </View>
        )}
      </View>

      {/* Spot price stamp */}
      {spotPrice ? (
        <Text className="text-[9px] text-tertiary">{priceLabel} · Live (end-of-day)</Text>
      ) : (
        <Text className="text-[9px] text-tertiary">Live price unavailable · showing cost basis</Text>
      )}
    </Card>
  );
}
