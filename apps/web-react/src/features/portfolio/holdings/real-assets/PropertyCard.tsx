import { useState } from 'react';
import { ListRow } from '@/components/shared';
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
      <div className="surface rounded-2xl px-4 py-3 flex flex-col gap-2.5">
        {/* Header row */}
        <ListRow
          icon="ti-building"
          iconColor="#8b5cf6"
          iconBg="#8b5cf615"
          iconSize="sm"
          title={<p className="text-sm font-semibold text-primary truncate">{holding.name}</p>}
          subtitle={
            <div className="flex items-center gap-1.5 flex-wrap">
              {meta.propertyType && (
                <span className="text-[10px] text-tertiary">
                  {propTypeLabel[meta.propertyType] ?? meta.propertyType}
                </span>
              )}
              {meta.propertyCity && <span className="text-[10px] text-tertiary">· {meta.propertyCity}</span>}
              {meta.propertyAreaSqft && (
                <span className="text-[10px] text-tertiary">
                  · {meta.propertyAreaSqft.toLocaleString('en-IN')} sqft
                </span>
              )}
            </div>
          }
          right={
            <button onClick={onEdit} className="w-8 h-8 flex items-center justify-center text-tertiary flex-shrink-0">
              <i className="ti ti-pencil" style={{ fontSize: 15 }} aria-hidden="true" />
            </button>
          }
        />

        {/* Value row */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] text-tertiary mb-0.5">Current value</p>
            <p className="text-lg font-bold text-primary tabular-nums">
              {!masked ? `₹${currentVal.toLocaleString('en-IN')}` : '••••'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-tertiary mb-0.5">vs purchase</p>
            <p className={`text-sm font-semibold tabular-nums ${gain >= 0 ? 'text-success' : 'text-danger'}`}>
              {gain >= 0 ? '+' : ''}
              {gainPct.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Staleness + update row */}
        <div className="flex items-center justify-between pt-0.5 border-t border-theme">
          <p className={`text-[10px] ${stale ? 'font-medium text-warning' : 'text-tertiary'}`}>
            {stale && <i className="ti ti-clock-exclamation mr-1" style={{ fontSize: 11 }} aria-hidden="true" />}
            {stalenessLabel}
          </p>
          <button
            onClick={() => setShowUpdateSheet(true)}
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: '#8b5cf615', color: '#8b5cf6' }}
          >
            <i className="ti ti-refresh" style={{ fontSize: 11 }} aria-hidden="true" />
            Update value
          </button>
        </div>
      </div>

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
