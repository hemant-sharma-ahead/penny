import { useState } from 'react';
import { IconBadge } from '@/components/ui';
import type { Holding } from '@/core/db/types';
import { realAssetIsStale, realAssetStalenessLabel } from './realAssetHelpers';
import { VehicleValidityBadge } from './VehicleValidityBadge';
import { VehicleDetailModal } from './VehicleDetailModal';

export function VehicleCard({
  holding,
  onEdit,
  onSave,
  mode
}: {
  holding: Holding;
  onEdit: () => void;
  onSave: (updated: Holding) => Promise<void>;
  mode: string;
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
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <IconBadge icon={vehicleIcon} color="#3b82f6" bg="#3b82f615" size="sm" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-primary truncate">
                {meta.vehicleMake && meta.vehicleModel ? `${meta.vehicleMake} ${meta.vehicleModel}` : holding.name}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                {meta.vehicleYear && <span className="text-[10px] text-tertiary">{meta.vehicleYear}</span>}
                {meta.vehicleFuelType && (
                  <span
                    className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: `${fuelColor}18`, color: fuelColor }}
                  >
                    {meta.vehicleFuelType}
                  </span>
                )}
                {meta.vehicleRegNumber && (
                  <span className="text-[10px] font-mono text-tertiary">
                    {mode === 'open' ? meta.vehicleRegNumber : `${meta.vehicleRegNumber.slice(0, 4)}••••`}
                  </span>
                )}
                {meta.vehicleRcStatus && (
                  <span
                    className="text-[9px] font-bold uppercase px-1 py-0.5 rounded"
                    style={{
                      backgroundColor: meta.vehicleRcStatus === 'ACTIVE' ? '#10b98112' : '#ef444412',
                      color: meta.vehicleRcStatus === 'ACTIVE' ? '#10b981' : '#ef4444'
                    }}
                  >
                    {meta.vehicleRcStatus}
                  </span>
                )}
              </div>
            </div>
          </div>
          <i
            className="ti ti-chevron-right text-tertiary flex-shrink-0 mt-1"
            style={{ fontSize: 15 }}
            aria-hidden="true"
          />
        </div>

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
                {mode === 'open' ? `₹${holding.investedAmount.toLocaleString('en-IN')}` : '••••'}
              </p>
              {gainPct !== null && (
                <p className={`text-[9px] font-medium ${gainPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {gainPct >= 0 ? '+' : ''}
                  {gainPct.toFixed(1)}% depreciation
                </p>
              )}
            </div>
          )}
          <div className="text-right">
            <p className="text-[10px] text-tertiary mb-0.5">Current value</p>
            <p className="text-lg font-bold text-primary tabular-nums">
              {mode === 'open' ? (currentVal > 0 ? `₹${currentVal.toLocaleString('en-IN')}` : '—') : '••••'}
            </p>
          </div>
        </div>

        {/* Challan row */}
        {hasChallanData && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
            style={{ backgroundColor: pendingChallans > 0 ? '#ef444410' : '#10b98110' }}
          >
            <i
              className={`ti ${pendingChallans > 0 ? 'ti-alert-triangle' : 'ti-shield-check'}`}
              style={{ fontSize: 13, color: pendingChallans > 0 ? '#ef4444' : '#10b981' }}
              aria-hidden="true"
            />
            <p className="text-[10px] font-medium" style={{ color: pendingChallans > 0 ? '#ef4444' : '#10b981' }}>
              {pendingChallans > 0
                ? `${pendingChallans} pending challan${pendingChallans > 1 ? 's' : ''} · ₹${(meta.vehicleChallanPendingAmount ?? 0).toLocaleString('en-IN')}`
                : 'No pending challans'}
            </p>
          </div>
        )}

        {/* Staleness label */}
        <div className="flex items-center justify-between pt-0.5 border-t border-theme">
          <p
            className={`text-[10px] ${valueStale ? 'font-medium' : 'text-tertiary'}`}
            style={valueStale ? { color: '#f59e0b' } : {}}
          >
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
        />
      )}
    </>
  );
}
