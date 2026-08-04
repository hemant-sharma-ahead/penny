import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '~/components/Icon';
import type { Holding } from '@/core/db/types';
import { realAssetIsStale, realAssetStalenessLabel } from './realAssetHelpers';
import { UpdateValueSheet } from './UpdateValueSheet';

// Fixed brand identity for every property card — matches VehicleCard.tsx's reasoning (fixed, not
// per-item hashed like Accounts — there are typically only 1-2 properties).
const GRADIENT: readonly [string, string] = ['#4a1d6b', '#1f0d2e'];
const GLOW = '#8b5cf6';
const GREEN = '#34d399';
const AMBER = '#f0b060';
const RED = '#f87171';

const ON_GRADIENT = {
  iconTileBg: 'rgba(255,255,255,0.16)',
  chipBg: 'rgba(255,255,255,0.1)',
  chipText: 'rgba(255,255,255,0.88)',
  labelText: 'rgba(255,255,255,0.55)',
  divider: 'rgba(255,255,255,0.14)',
  factsText: 'rgba(255,255,255,0.6)',
  chevron: 'rgba(255,255,255,0.55)'
} as const;

const PROP_TYPE_LABEL: Record<string, string> = {
  flat: 'Flat',
  house: 'House',
  plot: 'Plot',
  commercial: 'Commercial'
};

function purchaseDateLabel(ms?: number): string | null {
  if (!ms) return null;
  return `Purchased ${new Date(ms).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`;
}

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
  const [showUpdateSheet, setShowUpdateSheet] = useState(false);
  const meta = holding.assetMeta ?? {};
  const currentVal = holding.currentValue ?? holding.investedAmount;
  const gain = currentVal - holding.investedAmount;
  const gainPct = holding.investedAmount > 0 ? (gain / holding.investedAmount) * 100 : 0;
  const stale = realAssetIsStale(holding.lastUpdatedAt);
  const stalenessLabel = realAssetStalenessLabel(holding.lastUpdatedAt);

  const chips = [
    meta.propertyType ? (PROP_TYPE_LABEL[meta.propertyType] ?? meta.propertyType) : null,
    meta.propertyCity,
    meta.propertyAreaSqft ? `${meta.propertyAreaSqft.toLocaleString('en-IN')} sqft` : null
  ].filter((c): c is string => !!c);

  return (
    <>
      {/* No dedicated detail popup exists for Property (unlike Vehicle) — the whole card opens Edit
          directly, same destination the old separate edit-pencil pointed at, just unified onto one
          tap target with a chevron instead of a second small icon. */}
      <Pressable
        onPress={onEdit}
        accessibilityLabel={`Edit ${holding.name}`}
        style={{
          borderRadius: 18,
          backgroundColor: GRADIENT[1],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.4,
          shadowRadius: 16,
          elevation: 6
        }}
      >
        <LinearGradient
          colors={GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 18, overflow: 'hidden', padding: 14, position: 'relative' }}
        >
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: -20,
              top: -30,
              width: 130,
              height: 130,
              borderRadius: 65,
              opacity: 0.3,
              backgroundColor: GLOW
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: -20,
              bottom: -30,
              width: 100,
              height: 100,
              borderRadius: 50,
              opacity: 0.25,
              backgroundColor: '#000'
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: '-40%',
              left: '-15%',
              width: '150%',
              height: '180%',
              transform: [{ rotate: '-8deg' }],
              overflow: 'hidden'
            }}
          >
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.10)', 'transparent']}
              locations={[0.42, 0.5, 0.58]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0.4 }}
              style={{ flex: 1 }}
            />
          </View>

          <View className="flex-row items-center gap-2.5 mb-2.5">
            <View
              className="w-8 h-8 rounded-lg items-center justify-center"
              style={{ backgroundColor: ON_GRADIENT.iconTileBg }}
            >
              <Icon name="ti-building" size={15} color="#fff" />
            </View>
            <Text className="flex-1 text-sm font-bold" style={{ color: '#fff' }} numberOfLines={1}>
              {holding.name}
            </Text>
            <Icon name="ti-chevron-right" size={15} color={ON_GRADIENT.chevron} />
          </View>

          <View className="mb-2.5">
            <Text className="text-[9.5px]" style={{ color: ON_GRADIENT.labelText }}>
              Current value
            </Text>
            <Text className="text-[26px] font-extrabold" style={{ color: '#fff' }}>
              {masked ? '••••' : `₹${currentVal.toLocaleString('en-IN')}`}
            </Text>
            {holding.investedAmount > 0 && (
              <Text className="text-[10.5px] mt-0.5" style={{ color: ON_GRADIENT.labelText }}>
                vs purchase ·{' '}
                <Text style={{ color: gain >= 0 ? GREEN : RED, fontWeight: '700' }}>
                  {gain >= 0 ? '+' : ''}
                  {gainPct.toFixed(1)}%
                </Text>
              </Text>
            )}
          </View>

          {chips.length > 0 && (
            <View className="flex-row gap-1.5 mb-2.5">
              {chips.map((c) => (
                <View
                  key={c}
                  className="flex-1 items-center justify-center rounded-lg py-1.5"
                  style={{ backgroundColor: ON_GRADIENT.chipBg }}
                >
                  <Text
                    className="text-[9.5px] font-semibold"
                    numberOfLines={1}
                    style={{ color: ON_GRADIENT.chipText }}
                  >
                    {c}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View className="h-px mb-2" style={{ backgroundColor: ON_GRADIENT.divider }} />

          <View className="flex-row items-center justify-between gap-2 mb-2.5">
            <Text className="text-[10px] flex-1" numberOfLines={1} style={{ color: ON_GRADIENT.factsText }}>
              {purchaseDateLabel(meta.propertyPurchaseDate) ?? ''}
            </Text>
            <View className="flex-row items-center gap-1 shrink-0">
              <Icon name="ti-clock-hour-4" size={10} color={stale ? AMBER : ON_GRADIENT.factsText} />
              <Text className="text-[10px]" style={{ color: stale ? AMBER : ON_GRADIENT.factsText }}>
                {stalenessLabel}
              </Text>
            </View>
          </View>

          {/* Nested Pressable — RN's touch-responder system gives the innermost Pressable the touch
              (same pattern GlanceHeader.tsx's net-worth overlay relies on), so this opens the quick
              update-value sheet instead of falling through to the outer card's onEdit. */}
          <Pressable
            onPress={() => setShowUpdateSheet(true)}
            className="flex-row items-center justify-center gap-1 py-1.5 rounded-lg"
            style={{ backgroundColor: 'rgba(255,255,255,0.14)' }}
            accessibilityLabel="Update value"
          >
            <Icon name="ti-refresh" size={12} color="#fff" />
            <Text className="text-[10.5px] font-semibold" style={{ color: '#fff' }}>
              Update value
            </Text>
          </Pressable>
        </LinearGradient>
      </Pressable>

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
