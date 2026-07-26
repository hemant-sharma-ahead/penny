import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { ListRow } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Holding } from '@/core/db/types';
import { realAssetIsStale, realAssetStalenessLabel } from './realAssetHelpers';
import { UpdateValueSheet } from './UpdateValueSheet';

export function PropertyCard({
  holding,
  onEdit,
  onSave,
  masked
}: {
  holding: Holding;
  onEdit: () => void;
  onSave: (updated: Holding) => Promise<void>;
  masked: boolean;
}) {
  const theme = useThemeColors();
  const [showUpdateSheet, setShowUpdateSheet] = useState(false);
  const meta = holding.assetMeta ?? {};
  const currentVal = holding.currentValue ?? holding.investedAmount;
  const gain = currentVal - holding.investedAmount;
  const gainPct = holding.investedAmount > 0 ? (gain / holding.investedAmount) * 100 : 0;
  const stale = realAssetIsStale(holding.lastUpdatedAt);
  const stalenessLabel = realAssetStalenessLabel(holding.lastUpdatedAt);

  const propTypeLabel: Record<string, string> = {
    flat: 'Flat',
    house: 'House',
    plot: 'Plot',
    commercial: 'Commercial'
  };

  return (
    <>
      <View className="bg-surface border border-theme rounded-2xl px-4 py-3 flex-col gap-2.5">
        {/* Header row */}
        <ListRow
          icon="ti-building"
          iconColor="#8b5cf6"
          iconSize="sm"
          title={
            <Text className="text-sm font-semibold text-primary" numberOfLines={1}>
              {holding.name}
            </Text>
          }
          subtitle={
            <View className="flex-row items-center gap-1.5 flex-wrap">
              {meta.propertyType && (
                <Text className="text-[10px] text-tertiary">
                  {propTypeLabel[meta.propertyType] ?? meta.propertyType}
                </Text>
              )}
              {meta.propertyCity && <Text className="text-[10px] text-tertiary">· {meta.propertyCity}</Text>}
              {meta.propertyAreaSqft && (
                <Text className="text-[10px] text-tertiary">
                  · {meta.propertyAreaSqft.toLocaleString('en-IN')} sqft
                </Text>
              )}
            </View>
          }
          right={
            <Pressable onPress={onEdit} className="w-8 h-8 items-center justify-center shrink-0">
              <Icon name="ti-pencil" size={15} color={theme.textTertiary} />
            </Pressable>
          }
        />

        {/* Value row */}
        <View className="flex-row items-end justify-between">
          <View>
            <Text className="text-[10px] text-tertiary mb-0.5">Current value</Text>
            <Text className="text-lg font-bold text-primary tabular-nums">
              {!masked ? `₹${currentVal.toLocaleString('en-IN')}` : '••••'}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-[10px] text-tertiary mb-0.5">vs purchase</Text>
            <Text
              className="text-sm font-semibold tabular-nums"
              style={{ color: gain >= 0 ? theme.success : theme.danger }}
            >
              {gain >= 0 ? '+' : ''}
              {gainPct.toFixed(1)}%
            </Text>
          </View>
        </View>

        {/* Staleness + update row */}
        <View className="flex-row items-center justify-between pt-0.5 border-t border-theme">
          <View className="flex-row items-center gap-1">
            {stale && <Icon name="ti-clock-exclamation" size={11} color={theme.warning} />}
            <Text
              className={`text-[10px] ${stale ? 'font-medium' : 'text-tertiary'}`}
              style={stale ? { color: theme.warning } : undefined}
            >
              {stalenessLabel}
            </Text>
          </View>
          <Pressable
            onPress={() => setShowUpdateSheet(true)}
            className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
            style={{ backgroundColor: '#8b5cf615' }}
          >
            <Icon name="ti-refresh" size={11} color="#8b5cf6" />
            <Text className="text-[10px] font-semibold" style={{ color: '#8b5cf6' }}>
              Update value
            </Text>
          </Pressable>
        </View>
      </View>

      {showUpdateSheet && (
        <UpdateValueSheet
          holding={holding}
          onSave={async (updated) => {
            await onSave(updated);
            setShowUpdateSheet(false);
          }}
          onClose={() => setShowUpdateSheet(false)}
        />
      )}
    </>
  );
}
