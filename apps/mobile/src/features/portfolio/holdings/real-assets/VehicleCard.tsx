import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '~/components/Icon';
import type { Holding } from '@/core/db/types';
import { daysUntil } from '@/lib/date';
import { realAssetIsStale, realAssetStalenessLabel } from './realAssetHelpers';
import { VehicleDetailModal } from './VehicleDetailModal';

// Fixed brand identity for every vehicle card — not per-item/hashed like Accounts' mini-cards,
// since there are typically only 1-2 vehicles and "vehicle = this blue" is a simpler, sufficient
// cue than per-item variation would be here. Property (below) gets its own fixed violet.
const GRADIENT: readonly [string, string] = ['#16234f', '#0c1530'];
const GLOW = '#4d7aff';
const GREEN = '#34d399';
const AMBER = '#f0b060';
const RED = '#f87171';

// Translucent-white overlay treatment for a gradient identity card — same reasoning as
// AccountList.tsx's `ON_GRADIENT`: relative to the card's own background, not the app theme, so
// (like that file's convention) these intentionally stay fixed rather than reading `useThemeColors()`.
const ON_GRADIENT = {
  iconTileBg: 'rgba(255,255,255,0.16)',
  chipBg: 'rgba(255,255,255,0.1)',
  chipLabel: 'rgba(255,255,255,0.85)',
  labelText: 'rgba(255,255,255,0.55)',
  subText: 'rgba(255,255,255,0.65)',
  divider: 'rgba(255,255,255,0.14)',
  factsText: 'rgba(255,255,255,0.6)',
  chevron: 'rgba(255,255,255,0.55)'
} as const;

/** Neutral (unremarkable) until a validity date is actually close/past — matches the "colour is
 *  wayfinding, not decoration" principle: don't tint every date, only the ones that need attention. */
function validityColor(upto?: number | null): string {
  if (!upto) return ON_GRADIENT.chipLabel;
  const days = daysUntil(upto);
  if (days < 0) return RED;
  if (days <= 30) return AMBER;
  return ON_GRADIENT.chipLabel;
}

function validityDateStr(upto?: number | null): string {
  if (!upto) return '—';
  if (daysUntil(upto) < 0) return 'Expired';
  return new Date(upto).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

function ValidityChip({ icon, label, upto }: { icon: string; label: string; upto?: number | null }) {
  return (
    <View className="flex-1 items-center rounded-lg py-1.5" style={{ backgroundColor: ON_GRADIENT.chipBg }}>
      <View className="flex-row items-center gap-1">
        <Icon name={icon} size={9} color={ON_GRADIENT.chipLabel} />
        <Text className="text-[9px] font-bold" style={{ color: ON_GRADIENT.chipLabel }}>
          {label}
        </Text>
      </View>
      <Text className="text-[9.5px] font-bold mt-0.5" style={{ color: validityColor(upto) }}>
        {validityDateStr(upto)}
      </Text>
    </View>
  );
}

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
  const [showDetail, setShowDetail] = useState(false);
  const meta = holding.assetMeta ?? {};
  const valueStale = realAssetIsStale(holding.lastUpdatedAt);
  const stalenessLabel = realAssetStalenessLabel(holding.lastUpdatedAt);
  const currentVal = holding.currentValue ?? holding.investedAmount;
  const gain = holding.investedAmount > 0 ? currentVal - holding.investedAmount : null;
  const gainPct = gain !== null && holding.investedAmount > 0 ? (gain / holding.investedAmount) * 100 : null;

  const isTwoWheeler = (meta.vehicleType ?? '').toLowerCase().includes('two');
  const vehicleIcon = isTwoWheeler ? 'ti-motorbike' : 'ti-car';
  const isPending = !meta.vehicleRcFetchedAt;
  const hasValidity = !!(meta.vehicleInsuranceUpto || meta.vehiclePuccUpto || meta.vehicleRcValidUpto);
  const hasChallanData = meta.vehicleChallanFetchedAt != null;
  const pendingChallans = meta.vehicleChallanPending ?? 0;

  const facts = [
    meta.vehicleYear ? String(meta.vehicleYear) : null,
    meta.vehicleFuelType,
    meta.vehicleRegNumber
      ? mode === 'open'
        ? meta.vehicleRegNumber
        : `${meta.vehicleRegNumber.slice(0, 4)}••••`
      : null
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <Pressable
        onPress={() => setShowDetail(true)}
        accessibilityLabel={`View ${holding.name} details`}
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
          {/* Corner glow blooms + diagonal sheen — same "real card" technique as AccountList.tsx's
              mini-cards (see docs/DESIGN_GUIDELINES.md's "Identity-colour gradient mini card" entry). */}
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

          {/* Top row — icon + name + chevron */}
          <View className="flex-row items-center gap-2.5 mb-2.5">
            <View
              className="w-8 h-8 rounded-lg items-center justify-center"
              style={{ backgroundColor: ON_GRADIENT.iconTileBg }}
            >
              <Icon name={vehicleIcon} size={15} color="#fff" />
            </View>
            <Text className="flex-1 text-sm font-bold" style={{ color: '#fff' }} numberOfLines={1}>
              {meta.vehicleMake && meta.vehicleModel ? `${meta.vehicleMake} ${meta.vehicleModel}` : holding.name}
            </Text>
            <Icon name="ti-chevron-right" size={15} color={ON_GRADIENT.chevron} />
          </View>

          {isPending ? (
            <View
              className="flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-xl mb-1"
              style={{ backgroundColor: 'rgba(240,176,96,0.22)' }}
            >
              <Icon name="ti-clock-hour-4" size={13} color={AMBER} />
              <Text className="text-[10px] font-medium" style={{ color: AMBER }}>
                Awaiting vehicle details — tap to fetch
              </Text>
            </View>
          ) : (
            <>
              {/* Hero — current value dominates, purchase + depreciation as a quiet sub-line */}
              <View className="mb-2.5">
                <Text className="text-[9.5px]" style={{ color: ON_GRADIENT.labelText }}>
                  Current value
                </Text>
                <Text className="text-[26px] font-extrabold" style={{ color: '#fff' }}>
                  {masked ? '••••' : currentVal > 0 ? `₹${currentVal.toLocaleString('en-IN')}` : '—'}
                </Text>
                {holding.investedAmount > 0 && (
                  <Text className="text-[10.5px] mt-0.5" style={{ color: ON_GRADIENT.subText }}>
                    Purchase {masked ? '••••' : `₹${holding.investedAmount.toLocaleString('en-IN')}`}
                    {gainPct !== null && (
                      <Text style={{ color: gainPct >= 0 ? GREEN : RED, fontWeight: '700' }}>
                        {' '}
                        · {gainPct >= 0 ? '+' : ''}
                        {gainPct.toFixed(1)}%
                      </Text>
                    )}
                  </Text>
                )}
              </View>

              {hasValidity && (
                <View className="flex-row gap-1.5 mb-2.5">
                  <ValidityChip icon="ti-shield-check" label="INS" upto={meta.vehicleInsuranceUpto} />
                  <ValidityChip icon="ti-leaf" label="PUC" upto={meta.vehiclePuccUpto} />
                  <ValidityChip icon="ti-certificate" label="RC" upto={meta.vehicleRcValidUpto} />
                </View>
              )}
            </>
          )}

          {hasChallanData && (
            <View
              className="flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-xl mb-2.5"
              style={{ backgroundColor: pendingChallans > 0 ? 'rgba(248,113,113,0.25)' : 'rgba(52,211,153,0.2)' }}
            >
              <Icon
                name={pendingChallans > 0 ? 'ti-alert-triangle' : 'ti-shield-check'}
                size={13}
                color={pendingChallans > 0 ? RED : GREEN}
              />
              <Text className="text-[10px] font-semibold" style={{ color: '#fff' }}>
                {pendingChallans > 0
                  ? `${pendingChallans} pending challan${pendingChallans > 1 ? 's' : ''} · ₹${(meta.vehicleChallanPendingAmount ?? 0).toLocaleString('en-IN')}`
                  : 'No pending challans'}
              </Text>
            </View>
          )}

          <View className="h-px mb-2" style={{ backgroundColor: ON_GRADIENT.divider }} />

          {/* Status row — facts left, last-updated right. No "tap for details" text — the chevron
              up top already says it. */}
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-[10px] flex-1" numberOfLines={1} style={{ color: ON_GRADIENT.factsText }}>
              {facts}
              {meta.vehicleRcStatus && (
                <Text style={{ color: meta.vehicleRcStatus === 'ACTIVE' ? GREEN : RED, fontWeight: '700' }}>
                  {facts ? ' · ' : ''}
                  {meta.vehicleRcStatus === 'ACTIVE' ? 'Active' : meta.vehicleRcStatus}
                </Text>
              )}
            </Text>
            <View className="flex-row items-center gap-1 shrink-0">
              {valueStale && <Icon name="ti-clock-hour-4" size={10} color={AMBER} />}
              {!valueStale && <Icon name="ti-clock-hour-4" size={10} color={ON_GRADIENT.factsText} />}
              <Text className="text-[10px]" style={{ color: valueStale ? AMBER : ON_GRADIENT.factsText }}>
                {stalenessLabel}
              </Text>
            </View>
          </View>
        </LinearGradient>
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
