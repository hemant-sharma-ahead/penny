import { useState } from 'react';
import { Badge } from '@/components/ui';
import { ListRow } from '@/components/shared';
import { STATUS } from '@/lib/statusColors';
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
  const [showDetail, setShowDetail] = useState(false);
  const meta = holding.assetMeta ?? {};
  const valueStale = realAssetIsStale(holding.lastUpdatedAt);
  const stalenessLabel = realAssetStalenessLabel(holding.lastUpdatedAt);
  const currentVal = holding.currentValue ?? holding.investedAmount;
  const gain = holding.investedAmount > 0 ? currentVal - holding.investedAmount : null;
  const gainPct = gain !== null && holding.investedAmount > 0 ? (gain / holding.investedAmount) * 100 : null;

  const fuelColors: Record<string, string> = {
    PETROL: '#f59e0b',
    DIESEL: '#64748b',
    ELECTRIC: '#10b981',
    CNG: '#3b82f6',
    HYBRID: '#8b5cf6'
  };
  const fuelKey = (meta.vehicleFuelType ?? '').toUpperCase();
  const fuelColor = fuelColors[fuelKey] ?? '#64748b';
  const isTwoWheeler = (meta.vehicleType ?? '').toLowerCase().includes('two');
  const vehicleIcon = isTwoWheeler ? 'ti-motorbike' : 'ti-car';

  const hasChallanData = meta.vehicleChallanFetchedAt != null;
  const pendingChallans = meta.vehicleChallanPending ?? 0;

  return (
    <>
      <button
        onClick={() => setShowDetail(true)}
        className="surface rounded-2xl px-4 py-3 flex flex-col gap-3 w-full text-left"
      >
        {/* Header */}
        <ListRow
          icon={vehicleIcon}
          iconColor="#3b82f6"
          iconBg="#3b82f615"
          iconSize="sm"
          title={
            <p className="text-sm font-semibold text-primary truncate">
              {meta.vehicleMake && meta.vehicleModel ? `${meta.vehicleMake} ${meta.vehicleModel}` : holding.name}
            </p>
          }
          subtitle={
            <div className="flex items-center gap-1.5 flex-wrap">
              {meta.vehicleYear && <span className="text-[10px] text-tertiary">{meta.vehicleYear}</span>}
              {meta.vehicleFuelType && <Badge label={meta.vehicleFuelType.toUpperCase()} color={fuelColor} size="sm" />}
              {meta.vehicleRegNumber && (
                <span className="text-[10px] font-mono text-tertiary">
                  {mode === 'open' ? meta.vehicleRegNumber : `${meta.vehicleRegNumber.slice(0, 4)}••••`}
                </span>
              )}
              {meta.vehicleRcStatus && (
                <Badge
                  label={meta.vehicleRcStatus}
                  color={meta.vehicleRcStatus === 'ACTIVE' ? STATUS.success : STATUS.danger}
                  size="sm"
                  rounded="md"
                />
              )}
            </div>
          }
          right={<i className="ti ti-chevron-right text-tertiary" style={{ fontSize: 15 }} aria-hidden="true" />}
        />

        {/* Owner + address */}
        {meta.vehicleOwnerName && (
          <div className="flex items-center justify-between gap-2 -mt-1">
            <p className="text-[10px] text-secondary shrink-0">
              <i className="ti ti-user mr-1 text-tertiary" style={{ fontSize: 10 }} aria-hidden="true" />
              {mode === 'open' ? meta.vehicleOwnerName : '••••••••'}
            </p>
            {meta.vehiclePresentAddress && mode === 'open' && (
              <p className="text-[10px] text-tertiary truncate text-right">{meta.vehiclePresentAddress}</p>
            )}
          </div>
        )}

        {/* Validity badges row */}
        {(meta.vehicleInsuranceUpto || meta.vehiclePuccUpto || meta.vehicleRcValidUpto) && (
          <div className="flex gap-2">
            {meta.vehicleInsuranceUpto && <VehicleValidityBadge label="Insurance" upto={meta.vehicleInsuranceUpto} />}
            {meta.vehiclePuccUpto && <VehicleValidityBadge label="PUC" upto={meta.vehiclePuccUpto} />}
            {meta.vehicleRcValidUpto && <VehicleValidityBadge label="RC valid" upto={meta.vehicleRcValidUpto} />}
          </div>
        )}

        {/* Value row — purchase price left, current value right */}
        <div className="flex items-end justify-between gap-3">
          {holding.investedAmount > 0 && (
            <div>
              <p className="text-[10px] text-tertiary mb-0.5">Purchase price</p>
              <p className="text-sm font-semibold text-primary tabular-nums">
                {masked ? '••••' : `₹${holding.investedAmount.toLocaleString('en-IN')}`}
              </p>
              {gainPct !== null && (
                <p className={`text-[9px] font-medium ${gainPct >= 0 ? 'text-success' : 'text-danger'}`}>
                  {gainPct >= 0 ? '+' : ''}
                  {gainPct.toFixed(1)}% depreciation
                </p>
              )}
            </div>
          )}
          <div className="text-right">
            <p className="text-[10px] text-tertiary mb-0.5">Current value</p>
            <p className="text-lg font-bold text-primary tabular-nums">
              {masked ? '••••' : currentVal > 0 ? `₹${currentVal.toLocaleString('en-IN')}` : '—'}
            </p>
          </div>
        </div>

        {/* Challan row */}
        {hasChallanData && (
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl ${pendingChallans > 0 ? 'bg-danger-subtle' : 'bg-success-subtle'}`}
          >
            <i
              className={`ti ${pendingChallans > 0 ? 'ti-alert-triangle text-danger' : 'ti-shield-check text-success'}`}
              style={{ fontSize: 13 }}
              aria-hidden="true"
            />
            <p className={`text-[10px] font-medium ${pendingChallans > 0 ? 'text-danger' : 'text-success'}`}>
              {pendingChallans > 0
                ? `${pendingChallans} pending challan${pendingChallans > 1 ? 's' : ''} · ₹${(meta.vehicleChallanPendingAmount ?? 0).toLocaleString('en-IN')}`
                : 'No pending challans'}
            </p>
          </div>
        )}

        {/* Staleness label */}
        <div className="flex items-center justify-between pt-0.5 border-t border-theme">
          <p className={`text-[10px] ${valueStale ? 'font-medium text-warning' : 'text-tertiary'}`}>
            {valueStale && <i className="ti ti-clock-exclamation mr-1" style={{ fontSize: 11 }} aria-hidden="true" />}
            {stalenessLabel}
          </p>
          <p className="text-[10px] text-tertiary">Tap for details →</p>
        </div>
      </button>

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
