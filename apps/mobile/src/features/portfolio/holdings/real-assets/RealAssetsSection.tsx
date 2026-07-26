import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { IconBadge } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { AssetClass, Holding } from '@/core/db/types';
import { realAssetIsStale, realAssetStalenessLabel } from './realAssetHelpers';
import { VehicleCard } from './VehicleCard';
import { PropertyCard } from './PropertyCard';
import { VehicleModal } from './VehicleModal';
import { PropertyModal } from './PropertyModal';
import { OtherModal } from './OtherModal';

type RealAssetClass = Extract<AssetClass, 'vehicle' | 'property' | 'other'>;

interface RealAssetsSectionProps {
  holdings: Holding[];
  /** Real PrivacyMode — vehicle PII fields (reg number, owner name, address, policy number, …)
   *  stay hidden outside Open mode regardless of the Portfolio Safe Mode toggle. */
  mode: string;
  /** Portfolio Safe Mode toggle applied — amount fields only. */
  masked: boolean;
  onSave: (holding: Holding) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

// Real Assets slice: vehicles / property / other cards, each owning its detail &
// value-update sheets, plus this section's own add/edit modals.
export function RealAssetsSection({ holdings, mode, masked, onSave, onRemove }: RealAssetsSectionProps) {
  const theme = useThemeColors();
  const [form, setForm] = useState<{ ac: RealAssetClass; editing: Holding | null } | null>(null);

  const vehicles = holdings.filter((h) => h.assetClass === 'vehicle');
  const properties = holdings.filter((h) => h.assetClass === 'property');
  const others = holdings.filter((h) => h.assetClass === 'other');

  const close = () => setForm(null);
  const save = async (h: Holding) => {
    await onSave(h);
    close();
  };
  const del = (id: string) => {
    void onRemove(id).then(close);
  };

  return (
    <View className="px-4 py-3 flex-col gap-4">
      {/* Vehicles section */}
      <View>
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-1.5">
            <Icon name="ti-car" size={14} color={theme.info} />
            <Text className="text-xs font-semibold text-secondary">Vehicles</Text>
          </View>
          <Pressable
            onPress={() => setForm({ ac: 'vehicle', editing: null })}
            className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${theme.info}15` }}
          >
            <Icon name="ti-plus" size={11} color={theme.info} />
            <Text className="text-[10px] font-semibold" style={{ color: theme.info }}>
              Add
            </Text>
          </Pressable>
        </View>
        {vehicles.length === 0 ? (
          <Pressable
            onPress={() => setForm({ ac: 'vehicle', editing: null })}
            className="w-full bg-surface border border-theme rounded-2xl px-4 py-5 items-center gap-2 border border-dashed"
            style={{ borderColor: theme.border }}
          >
            <Icon name="ti-car" size={28} color={`${theme.info}40`} />
            <Text className="text-xs text-tertiary">Track your car, bike, or other vehicle</Text>
            <Text className="text-[10px] font-semibold" style={{ color: theme.info }}>
              + Add vehicle
            </Text>
          </Pressable>
        ) : (
          <View className="flex-col gap-3">
            {vehicles.map((h) => (
              <VehicleCard
                key={h.id}
                holding={h}
                onEdit={() => setForm({ ac: 'vehicle', editing: h })}
                onSave={onSave}
                mode={mode}
                masked={masked}
              />
            ))}
          </View>
        )}
      </View>

      {/* Properties section */}
      <View>
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-1.5">
            <Icon name="ti-building" size={14} color="#8b5cf6" />
            <Text className="text-xs font-semibold text-secondary">Property</Text>
          </View>
          <Pressable
            onPress={() => setForm({ ac: 'property', editing: null })}
            className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
            style={{ backgroundColor: '#8b5cf615' }}
          >
            <Icon name="ti-plus" size={11} color="#8b5cf6" />
            <Text className="text-[10px] font-semibold" style={{ color: '#8b5cf6' }}>
              Add
            </Text>
          </Pressable>
        </View>
        {properties.length === 0 ? (
          <Pressable
            onPress={() => setForm({ ac: 'property', editing: null })}
            className="w-full bg-surface border border-theme rounded-2xl px-4 py-5 items-center gap-2 border border-dashed"
            style={{ borderColor: theme.border }}
          >
            <Icon name="ti-building" size={28} color="#8b5cf640" />
            <Text className="text-xs text-tertiary">Track flat, house, plot, or commercial property</Text>
            <Text className="text-[10px] font-semibold" style={{ color: '#8b5cf6' }}>
              + Add property
            </Text>
          </Pressable>
        ) : (
          <View className="flex-col gap-3">
            {properties.map((h) => (
              <PropertyCard
                key={h.id}
                holding={h}
                onEdit={() => setForm({ ac: 'property', editing: h })}
                onSave={onSave}
                masked={masked}
              />
            ))}
          </View>
        )}
      </View>

      {/* Other assets section */}
      {others.length > 0 && (
        <View>
          <View className="flex-row items-center gap-1.5 mb-2">
            <Icon name="ti-dots" size={14} color={theme.neutral} />
            <Text className="text-xs font-semibold text-secondary">Other Assets</Text>
          </View>
          <View className="flex-col gap-3">
            {others.map((h) => {
              const currentVal = h.currentValue ?? h.investedAmount;
              const gain = currentVal - h.investedAmount;
              const gainPct = h.investedAmount > 0 ? (gain / h.investedAmount) * 100 : 0;
              const stale = realAssetIsStale(h.lastUpdatedAt);
              return (
                <Pressable
                  key={h.id}
                  onPress={() => setForm({ ac: 'other', editing: h })}
                  className="bg-surface border border-theme rounded-2xl px-4 py-3 flex-row items-center gap-3 w-full"
                >
                  <IconBadge icon="ti-dots" color={theme.neutral} size="sm" />
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-primary" numberOfLines={1}>
                      {h.name}
                    </Text>
                    <Text className="text-[10px] text-tertiary">
                      {realAssetStalenessLabel(h.lastUpdatedAt)}
                      {stale ? ' · Stale' : ''}
                    </Text>
                  </View>
                  <View className="items-end shrink-0">
                    <Text className="text-sm font-semibold text-primary">
                      {masked ? '••••' : `₹${currentVal.toLocaleString('en-IN')}`}
                    </Text>
                    {!masked && (
                      <Text
                        className="text-[10px] font-medium"
                        style={{ color: gain >= 0 ? theme.success : theme.danger }}
                      >
                        {gain >= 0 ? '+' : ''}
                        {gainPct.toFixed(1)}%
                      </Text>
                    )}
                  </View>
                  <Icon name="ti-chevron-right" size={15} color={theme.textTertiary} />
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {form?.ac === 'vehicle' && <VehicleModal editing={form.editing} onSave={save} onDelete={del} onClose={close} />}
      {form?.ac === 'property' && <PropertyModal editing={form.editing} onSave={save} onDelete={del} onClose={close} />}
      {form?.ac === 'other' && <OtherModal editing={form.editing} onSave={save} onDelete={del} onClose={close} />}
    </View>
  );
}
