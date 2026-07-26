import { useState } from 'react';
import { View, Text } from 'react-native';
import { Modal, Button, Card, IconBadge } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import type { Holding } from '@/core/db/types';
import { realAssetIsStale } from './realAssetHelpers';
import { VehicleValidityBadge } from './VehicleValidityBadge';
import { UpdateValueSheet } from './UpdateValueSheet';

function VehicleDetailRow({
  label,
  value,
  masked,
  mode
}: {
  label: string;
  value?: string | number | null | undefined;
  masked?: boolean;
  mode: string;
}) {
  if (!value && value !== 0) return null;
  const display = masked && mode !== 'open' ? '••••' : String(value);
  return (
    <View className="flex-row items-start justify-between py-2.5 border-b border-theme last:border-0 gap-3">
      <Text className="text-xs text-tertiary shrink-0">{label}</Text>
      <Text className="text-xs font-medium text-primary text-right flex-1">{display}</Text>
    </View>
  );
}

export function VehicleDetailModal({
  holding,
  onClose,
  onEdit,
  onSave,
  mode,
  masked
}: {
  holding: Holding;
  onClose: () => void;
  onEdit: () => void;
  onSave: (updated: Holding) => Promise<void>;
  /** Real PrivacyMode — PII rows below stay hidden outside Open regardless of Safe Mode. */
  mode: string;
  /** Portfolio Safe Mode toggle applied — amount fields only. */
  masked: boolean;
}) {
  const theme = useThemeColors();
  const meta = holding.assetMeta ?? {};
  const [showUpdateSheet, setShowUpdateSheet] = useState(false);
  const currentVal = holding.currentValue ?? holding.investedAmount;
  const gain = holding.investedAmount > 0 ? currentVal - holding.investedAmount : null;
  const gainPct = gain !== null && holding.investedAmount > 0 ? (gain / holding.investedAmount) * 100 : null;
  const stale = realAssetIsStale(holding.lastUpdatedAt);

  const fuelColors: Record<string, string> = {
    PETROL: theme.warning,
    DIESEL: theme.neutral,
    ELECTRIC: theme.success,
    CNG: theme.info,
    HYBRID: '#8b5cf6'
  };
  const fuelKey = (meta.vehicleFuelType ?? '').toUpperCase();
  const fuelColor = fuelColors[fuelKey] ?? theme.neutral;

  function dateStr(ms?: number | null) {
    if (!ms) return null;
    return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const pendingChallans = meta.vehicleChallanPending ?? 0;

  // RN port note: web hand-rolls its own `fixed inset-0` centered overlay here instead of using the
  // shared Modal component. Rebuilt on top of the real `~/components/ui` Modal (same centered-card
  // positioning, already correct for RN) rather than translating the CSS overlay, which has no RN
  // equivalent anyway — same "use the real component" precedent as SelectInput's redesign.
  return (
    <>
      <Modal
        onClose={onClose}
        title={meta.vehicleMake && meta.vehicleModel ? `${meta.vehicleMake} ${meta.vehicleModel}` : holding.name}
        scrollable
        footer={
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                onPress={() => {
                  onClose();
                  onEdit();
                }}
              >
                Edit
              </Button>
            </View>
            <View className="flex-1">
              <Button variant="primary" size="lg" fullWidth color={theme.info} onPress={() => setShowUpdateSheet(true)}>
                Update value
              </Button>
            </View>
          </View>
        }
      >
        {/* Header */}
        <View className="flex-row items-center gap-3 -mt-1">
          <IconBadge icon="ti-car" color={theme.info} />
          <View className="flex-row items-center gap-1.5 flex-wrap flex-1">
            {meta.vehicleYear && <Text className="text-[10px] text-tertiary">{meta.vehicleYear}</Text>}
            {meta.vehicleFuelType && (
              <Text
                className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: `${fuelColor}18`, color: fuelColor }}
              >
                {meta.vehicleFuelType}
              </Text>
            )}
            {meta.vehicleRcStatus && (
              <Text
                className="text-[9px] font-bold uppercase px-1 py-0.5 rounded"
                style={{
                  backgroundColor: meta.vehicleRcStatus === 'ACTIVE' ? `${theme.success}12` : `${theme.danger}12`,
                  color: meta.vehicleRcStatus === 'ACTIVE' ? theme.success : theme.danger
                }}
              >
                {meta.vehicleRcStatus}
              </Text>
            )}
          </View>
        </View>

        {/* Validity badges */}
        {(meta.vehicleInsuranceUpto || meta.vehiclePuccUpto || meta.vehicleRcValidUpto) && (
          <View className="flex-row gap-2">
            {meta.vehicleInsuranceUpto && <VehicleValidityBadge label="Insurance" upto={meta.vehicleInsuranceUpto} />}
            {meta.vehiclePuccUpto && <VehicleValidityBadge label="PUC" upto={meta.vehiclePuccUpto} />}
            {meta.vehicleRcValidUpto && <VehicleValidityBadge label="RC valid" upto={meta.vehicleRcValidUpto} />}
          </View>
        )}

        {/* Value tiles */}
        <View className="flex-row flex-wrap gap-2">
          <View className="flex-1 min-w-[45%] rounded-xl p-3" style={{ backgroundColor: theme.surfaceSecondary }}>
            <Text className="text-[10px] text-tertiary mb-0.5">Current value</Text>
            <Text className="text-base font-bold text-primary tabular-nums">
              {masked ? '••••' : currentVal > 0 ? `₹${currentVal.toLocaleString('en-IN')}` : '—'}
            </Text>
            {stale && (
              <Text className="text-[9px] mt-0.5 font-medium" style={{ color: theme.warning }}>
                Needs update
              </Text>
            )}
          </View>
          <View className="flex-1 min-w-[45%] rounded-xl p-3" style={{ backgroundColor: theme.surfaceSecondary }}>
            <Text className="text-[10px] text-tertiary mb-0.5">Purchase price</Text>
            <Text className="text-base font-bold text-primary tabular-nums">
              {masked
                ? '••••'
                : holding.investedAmount > 0
                  ? `₹${holding.investedAmount.toLocaleString('en-IN')}`
                  : '—'}
            </Text>
            {gainPct !== null && (
              <Text
                className="text-[9px] mt-0.5 font-medium"
                style={{ color: gainPct >= 0 ? theme.success : theme.danger }}
              >
                {gainPct >= 0 ? '+' : ''}
                {gainPct.toFixed(1)}%
              </Text>
            )}
          </View>
        </View>

        {/* Vehicle identity */}
        <View>
          <Text className="text-[10px] font-semibold text-tertiary uppercase tracking-wide mb-1.5">Vehicle</Text>
          <View className="bg-surface border border-theme rounded-xl px-3">
            <VehicleDetailRow mode={mode} label="Manufacturer" value={meta.vehicleMake} />
            <VehicleDetailRow mode={mode} label="Model" value={meta.vehicleModel} />
            <VehicleDetailRow
              mode={mode}
              label="Year of manufacture"
              value={meta.vehicleManufactureLabel ?? (meta.vehicleYear ? String(meta.vehicleYear) : null)}
            />
            <VehicleDetailRow mode={mode} label="Body type" value={meta.vehicleBodyType} />
            <VehicleDetailRow mode={mode} label="Colour" value={meta.vehicleColor} />
            <VehicleDetailRow mode={mode} label="Vehicle class" value={meta.vehicleType} />
            <VehicleDetailRow mode={mode} label="Engine number" value={meta.vehicleEngineNo} masked />
            <VehicleDetailRow mode={mode} label="Chassis number" value={meta.vehicleChassisNo} masked />
          </View>
        </View>

        {/* Engine & specs */}
        {(meta.vehicleCubicCap ||
          meta.vehicleNorms ||
          meta.vehicleSeatCap ||
          meta.vehicleUnladenWeight ||
          meta.vehicleGrossWeight) && (
          <View>
            <Text className="text-[10px] font-semibold text-tertiary uppercase tracking-wide mb-1.5">
              Engine & specs
            </Text>
            <View className="bg-surface border border-theme rounded-xl px-3">
              <VehicleDetailRow mode={mode} label="Engine capacity (CC)" value={meta.vehicleCubicCap} />
              <VehicleDetailRow mode={mode} label="Fuel type" value={meta.vehicleFuelType} />
              <VehicleDetailRow mode={mode} label="Emission norms" value={meta.vehicleNorms} />
              <VehicleDetailRow mode={mode} label="Seating capacity" value={meta.vehicleSeatCap} />
              <VehicleDetailRow mode={mode} label="Unladen weight (kg)" value={meta.vehicleUnladenWeight} />
              <VehicleDetailRow mode={mode} label="Gross vehicle weight (kg)" value={meta.vehicleGrossWeight} />
            </View>
          </View>
        )}

        {/* Registration */}
        <View>
          <Text className="text-[10px] font-semibold text-tertiary uppercase tracking-wide mb-1.5">Registration</Text>
          <View className="bg-surface border border-theme rounded-xl px-3">
            <VehicleDetailRow mode={mode} label="Reg number" value={meta.vehicleRegNumber} masked />
            <VehicleDetailRow mode={mode} label="Registration date" value={meta.vehicleRegDate} />
            <VehicleDetailRow mode={mode} label="RTO" value={meta.vehicleRtoLocation} />
            <VehicleDetailRow mode={mode} label="RC status" value={meta.vehicleRcStatus} />
            <VehicleDetailRow mode={mode} label="RC valid upto" value={dateStr(meta.vehicleRcValidUpto)} />
            <VehicleDetailRow mode={mode} label="Fitness upto" value={dateStr(meta.vehicleFitnessUpto)} />
          </View>
        </View>

        {/* Compliance */}
        <View>
          <Text className="text-[10px] font-semibold text-tertiary uppercase tracking-wide mb-1.5">Compliance</Text>
          <View className="bg-surface border border-theme rounded-xl px-3">
            <VehicleDetailRow mode={mode} label="Insurance company" value={meta.vehicleInsuranceCompany} />
            <VehicleDetailRow mode={mode} label="Policy number" value={meta.vehicleInsurancePolicyNo} masked />
            <VehicleDetailRow mode={mode} label="Insurance valid upto" value={dateStr(meta.vehicleInsuranceUpto)} />
            <VehicleDetailRow mode={mode} label="PUC certificate no." value={meta.vehiclePuccNo} masked />
            <VehicleDetailRow mode={mode} label="PUC valid upto" value={dateStr(meta.vehiclePuccUpto)} />
          </View>
        </View>

        {/* Owner */}
        {(meta.vehicleOwnerName || meta.vehiclePresentAddress) && (
          <View>
            <Text className="text-[10px] font-semibold text-tertiary uppercase tracking-wide mb-1.5">Owner</Text>
            <View className="bg-surface border border-theme rounded-xl px-3">
              <VehicleDetailRow mode={mode} label="Name" value={meta.vehicleOwnerName} masked />
              <VehicleDetailRow mode={mode} label="Present address" value={meta.vehiclePresentAddress} masked />
              <VehicleDetailRow mode={mode} label="Permanent address" value={meta.vehiclePermanentAddress} masked />
              <VehicleDetailRow mode={mode} label="Financer / Hypothecation" value={meta.vehicleFinancer} />
            </View>
          </View>
        )}

        {/* Challans — individual records */}
        {meta.vehicleChallanFetchedAt && (
          <View>
            <View className="flex-row items-center justify-between mb-1.5">
              <Text className="text-[10px] font-semibold text-tertiary uppercase tracking-wide">Traffic challans</Text>
              {pendingChallans > 0 && (
                <Text
                  className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${theme.danger}15`, color: theme.danger }}
                >
                  ⚠ {pendingChallans} pending
                </Text>
              )}
            </View>
            {(meta.vehicleChallanRecords ?? []).length > 0 ? (
              <View className="flex-col gap-2">
                {(meta.vehicleChallanRecords ?? []).map((c, i) => {
                  const isPending = c.paymentStatus === 'UNPAID';
                  const isPaid = c.paymentStatus === 'PAID';
                  const isDisposed = c.paymentStatus === 'DISPOSED';
                  const statusColor = isPending
                    ? theme.danger
                    : isPaid
                      ? theme.success
                      : isDisposed
                        ? '#6366f1'
                        : theme.textTertiary;
                  const fmtDate = c.date
                    ? (() => {
                        const d = new Date(c.date);
                        return isNaN(d.getTime())
                          ? c.date
                          : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                      })()
                    : null;
                  const rtoLabel = [c.rto, c.state].filter(Boolean).join(' · ') || '—';
                  return (
                    <Card key={i} padding="xs" radius="md" className="flex-col gap-2">
                      {/* Top row: challan no + amount */}
                      <View className="flex-row items-start justify-between gap-2">
                        <View className="flex-1">
                          <Text className="text-xs font-semibold text-primary">
                            {c.challanNo || `Challan ${i + 1}`}
                          </Text>
                          {fmtDate && <Text className="text-[10px] text-tertiary">{fmtDate}</Text>}
                        </View>
                        <Text
                          className="text-sm font-bold tabular-nums shrink-0"
                          style={{ color: isPending ? theme.danger : theme.textPrimary }}
                        >
                          {masked ? '••••' : `₹${c.amount.toLocaleString('en-IN')}`}
                        </Text>
                      </View>
                      {/* Detail rows — always shown, — when absent */}
                      <View className="flex-col gap-1.5">
                        <View>
                          <Text className="text-[9px] text-tertiary">Offense</Text>
                          <Text className="text-[10px] text-primary leading-snug">{c.offenceDetails || '—'}</Text>
                        </View>
                        <View>
                          <Text className="text-[9px] text-tertiary">Place</Text>
                          <Text className="text-[10px] text-primary">{c.challanPlace || '—'}</Text>
                        </View>
                        <View className="flex-row flex-wrap gap-x-3">
                          <View className="flex-1 min-w-[45%]">
                            <Text className="text-[9px] text-tertiary">Court</Text>
                            <Text className="text-[10px] text-primary">{c.courtName || '—'}</Text>
                          </View>
                          <View className="flex-1 min-w-[45%]">
                            <Text className="text-[9px] text-tertiary">RTO</Text>
                            <Text className="text-[10px] text-primary">{rtoLabel}</Text>
                          </View>
                        </View>
                      </View>
                      {/* Status row — payment status + challan status + type all in one line */}
                      <View className="flex-row items-center gap-1.5 pt-1 border-t border-theme flex-wrap">
                        <Text
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: `${statusColor}15`, color: statusColor }}
                        >
                          {c.paymentStatus || 'UNKNOWN'}
                        </Text>
                        {c.challanStatus && (
                          <Text
                            className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: theme.surfaceSecondary, color: theme.textTertiary }}
                          >
                            {c.challanStatus}
                          </Text>
                        )}
                        {c.challanType && (
                          <Text
                            className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: theme.surfaceSecondary, color: theme.textTertiary }}
                          >
                            {c.challanType}
                          </Text>
                        )}
                      </View>
                    </Card>
                  );
                })}
              </View>
            ) : (
              <View className="bg-surface border border-theme rounded-xl px-3">
                <VehicleDetailRow mode={mode} label="Total" value={meta.vehicleChallanTotal ?? 0} />
                <VehicleDetailRow mode={mode} label="Pending" value={meta.vehicleChallanPending ?? 0} />
                {pendingChallans > 0 && (
                  <VehicleDetailRow
                    mode={mode}
                    label="Pending amount"
                    value={
                      !masked && meta.vehicleChallanPendingAmount
                        ? `₹${meta.vehicleChallanPendingAmount.toLocaleString('en-IN')}`
                        : '••••'
                    }
                  />
                )}
                <VehicleDetailRow mode={mode} label="Paid" value={meta.vehicleChallanPaid ?? 0} />
                <VehicleDetailRow mode={mode} label="Disposed" value={meta.vehicleChallanDisposed ?? 0} />
              </View>
            )}
          </View>
        )}

        {meta.vehicleRcFetchedAt && (
          <Text className="text-[9px] text-tertiary text-center pb-1">
            RC data fetched {dateStr(meta.vehicleRcFetchedAt)}
          </Text>
        )}
      </Modal>

      {showUpdateSheet && (
        <UpdateValueSheet
          holding={holding}
          onSave={async (updated) => {
            await onSave(updated);
            setShowUpdateSheet(false);
            onClose();
          }}
          onClose={() => setShowUpdateSheet(false)}
        />
      )}
    </>
  );
}
