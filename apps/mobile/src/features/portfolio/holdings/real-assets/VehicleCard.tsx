import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Badge } from '~/components/ui';
import { ListRow } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Holding } from '@/core/db/types';
import { realAssetIsStale, realAssetStalenessLabel } from './realAssetHelpers';
import { VehicleValidityBadge } from './VehicleValidityBadge';
import { VehicleDetailModal } from './VehicleDetailModal';

export function VehicleCard({
  holding,
  onEdit,
  onSave,
  mode,
  masked
}: {
  holding: Holding;
  onEdit: () => void;
  onSave: (updated: Holding) => Promise<void>;
  /** Real PrivacyMode — PII fields (reg number, owner name, address) stay hidden outside Open. */
  mode: string;
  /** Portfolio Safe Mode toggle applied — amount fields only. */
  masked: boolean;
}) {
  const theme = useThemeColors();
  const [showDetail, setShowDetail] = useState(false);
  const meta = holding.assetMeta ?? {};
  const valueStale = realAssetIsStale(holding.lastUpdatedAt);
  const stalenessLabel = realAssetStalenessLabel(holding.lastUpdatedAt);
  const currentVal = holding.currentValue ?? holding.investedAmount;
  const gain = holding.investedAmount > 0 ? currentVal - holding.investedAmount : null;
  const gainPct = gain !== null && holding.investedAmount > 0 ? (gain / holding.investedAmount) * 100 : null;

  const fuelColors: Record<string, string> = {
    PETROL: theme.warning,
    DIESEL: theme.neutral,
    ELECTRIC: theme.success,
    CNG: theme.info,
    HYBRID: '#8b5cf6'
  };
  const fuelKey = (meta.vehicleFuelType ?? '').toUpperCase();
  const fuelColor = fuelColors[fuelKey] ?? theme.neutral;
  const isTwoWheeler = (meta.vehicleType ?? '').toLowerCase().includes('two');
  const vehicleIcon = isTwoWheeler ? 'ti-motorbike' : 'ti-car';

  const hasChallanData = meta.vehicleChallanFetchedAt != null;
  const pendingChallans = meta.vehicleChallanPending ?? 0;

  return (
    <>
      <Pressable onPress={() => setShowDetail(true)} className="surface rounded-2xl px-4 py-3 flex-col gap-3 w-full">
        {/* Header */}
        <ListRow
          icon={vehicleIcon}
          iconColor={theme.info}
          iconSize="sm"
          title={
            <Text className="text-sm font-semibold text-primary" numberOfLines={1}>
              {meta.vehicleMake && meta.vehicleModel ? `${meta.vehicleMake} ${meta.vehicleModel}` : holding.name}
            </Text>
          }
          subtitle={
            <View className="flex-row items-center gap-1.5 flex-wrap">
              {meta.vehicleYear && <Text className="text-[10px] text-tertiary">{meta.vehicleYear}</Text>}
              {meta.vehicleFuelType && <Badge label={meta.vehicleFuelType.toUpperCase()} color={fuelColor} size="sm" />}
              {meta.vehicleRegNumber && (
                <Text className="text-[10px] text-tertiary">
                  {mode === 'open' ? meta.vehicleRegNumber : `${meta.vehicleRegNumber.slice(0, 4)}••••`}
                </Text>
              )}
              {meta.vehicleRcStatus && (
                <Badge
                  label={meta.vehicleRcStatus}
                  color={meta.vehicleRcStatus === 'ACTIVE' ? theme.success : theme.danger}
                  size="sm"
                  rounded="md"
                />
              )}
            </View>
          }
          right={<Icon name="ti-chevron-right" size={15} color={theme.textTertiary} />}
        />

        {/* Owner + address */}
        {meta.vehicleOwnerName && (
          <View className="flex-row items-center justify-between gap-2 -mt-1">
            <View className="flex-row items-center gap-1 shrink-0">
              <Icon name="ti-user" size={10} color={theme.textTertiary} />
              <Text className="text-[10px] text-secondary">{mode === 'open' ? meta.vehicleOwnerName : '••••••••'}</Text>
            </View>
            {meta.vehiclePresentAddress && mode === 'open' && (
              <Text className="text-[10px] text-tertiary text-right flex-1" numberOfLines={1}>
                {meta.vehiclePresentAddress}
              </Text>
            )}
          </View>
        )}

        {/* Validity badges row */}
        {(meta.vehicleInsuranceUpto || meta.vehiclePuccUpto || meta.vehicleRcValidUpto) && (
          <View className="flex-row gap-2">
            {meta.vehicleInsuranceUpto && <VehicleValidityBadge label="Insurance" upto={meta.vehicleInsuranceUpto} />}
            {meta.vehiclePuccUpto && <VehicleValidityBadge label="PUC" upto={meta.vehiclePuccUpto} />}
            {meta.vehicleRcValidUpto && <VehicleValidityBadge label="RC valid" upto={meta.vehicleRcValidUpto} />}
          </View>
        )}

        {/* Value row — purchase price left, current value right */}
        <View className="flex-row items-end justify-between gap-3">
          {holding.investedAmount > 0 && (
            <View>
              <Text className="text-[10px] text-tertiary mb-0.5">Purchase price</Text>
              <Text className="text-sm font-semibold text-primary tabular-nums">
                {masked ? '••••' : `₹${holding.investedAmount.toLocaleString('en-IN')}`}
              </Text>
              {gainPct !== null && (
                <Text className="text-[9px] font-medium" style={{ color: gainPct >= 0 ? theme.success : theme.danger }}>
                  {gainPct >= 0 ? '+' : ''}
                  {gainPct.toFixed(1)}% depreciation
                </Text>
              )}
            </View>
          )}
          <View className="items-end">
            <Text className="text-[10px] text-tertiary mb-0.5">Current value</Text>
            <Text className="text-lg font-bold text-primary tabular-nums">
              {masked ? '••••' : currentVal > 0 ? `₹${currentVal.toLocaleString('en-IN')}` : '—'}
            </Text>
          </View>
        </View>

        {/* Challan row */}
        {hasChallanData && (
          <View
            className="flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
            style={{ backgroundColor: pendingChallans > 0 ? `${theme.danger}12` : `${theme.success}12` }}
          >
            <Icon
              name={pendingChallans > 0 ? 'ti-alert-triangle' : 'ti-shield-check'}
              size={13}
              color={pendingChallans > 0 ? theme.danger : theme.success}
            />
            <Text
              className="text-[10px] font-medium"
              style={{ color: pendingChallans > 0 ? theme.danger : theme.success }}
            >
              {pendingChallans > 0
                ? `${pendingChallans} pending challan${pendingChallans > 1 ? 's' : ''} · ₹${(meta.vehicleChallanPendingAmount ?? 0).toLocaleString('en-IN')}`
                : 'No pending challans'}
            </Text>
          </View>
        )}

        {/* Staleness label */}
        <View className="flex-row items-center justify-between pt-0.5 border-t border-theme">
          <View className="flex-row items-center gap-1">
            {valueStale && <Icon name="ti-clock-exclamation" size={11} color={theme.warning} />}
            <Text
              className={`text-[10px] ${valueStale ? 'font-medium' : 'text-tertiary'}`}
              style={valueStale ? { color: theme.warning } : undefined}
            >
              {stalenessLabel}
            </Text>
          </View>
          <Text className="text-[10px] text-tertiary">Tap for details →</Text>
        </View>
      </Pressable>

      {showDetail && (
        <VehicleDetailModal
          holding={holding}
          onClose={() => setShowDetail(false)}
          onEdit={() => {
            setShowDetail(false);
            onEdit();
          }}
          onSave={async (updated) => {
            await onSave(updated);
            setShowDetail(false);
          }}
          mode={mode}
          masked={masked}
        />
      )}
    </>
  );
}
