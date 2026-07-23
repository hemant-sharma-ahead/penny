import { useState } from 'react';
import { IconBadge } from '@/components/ui';
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
    <div className="px-4 py-3 flex flex-col gap-4">
      {/* Vehicles section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-secondary flex items-center gap-1.5">
            <i className="ti ti-car" style={{ fontSize: 14, color: '#3b82f6' }} aria-hidden="true" />
            Vehicles
          </p>
          <button
            onClick={() => setForm({ ac: 'vehicle', editing: null })}
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: '#3b82f615', color: '#3b82f6' }}
          >
            <i className="ti ti-plus" style={{ fontSize: 11 }} aria-hidden="true" />
            Add
          </button>
        </div>
        {vehicles.length === 0 ? (
          <button
            onClick={() => setForm({ ac: 'vehicle', editing: null })}
            className="w-full surface rounded-2xl px-4 py-5 flex flex-col items-center gap-2 border-dashed"
            style={{ borderStyle: 'dashed', borderColor: 'var(--color-border)' }}
          >
            <i className="ti ti-car" style={{ fontSize: 28, color: '#3b82f640' }} aria-hidden="true" />
            <p className="text-xs text-tertiary">Track your car, bike, or other vehicle</p>
            <p className="text-[10px] font-semibold" style={{ color: '#3b82f6' }}>
              + Add vehicle
            </p>
          </button>
        ) : (
          <div className="flex flex-col gap-3">
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
          </div>
        )}
      </div>

      {/* Properties section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-secondary flex items-center gap-1.5">
            <i className="ti ti-building" style={{ fontSize: 14, color: '#8b5cf6' }} aria-hidden="true" />
            Property
          </p>
          <button
            onClick={() => setForm({ ac: 'property', editing: null })}
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: '#8b5cf615', color: '#8b5cf6' }}
          >
            <i className="ti ti-plus" style={{ fontSize: 11 }} aria-hidden="true" />
            Add
          </button>
        </div>
        {properties.length === 0 ? (
          <button
            onClick={() => setForm({ ac: 'property', editing: null })}
            className="w-full surface rounded-2xl px-4 py-5 flex flex-col items-center gap-2"
            style={{ borderStyle: 'dashed', borderColor: 'var(--color-border)' }}
          >
            <i className="ti ti-building" style={{ fontSize: 28, color: '#8b5cf640' }} aria-hidden="true" />
            <p className="text-xs text-tertiary">Track flat, house, plot, or commercial property</p>
            <p className="text-[10px] font-semibold" style={{ color: '#8b5cf6' }}>
              + Add property
            </p>
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            {properties.map((h) => (
              <PropertyCard
                key={h.id}
                holding={h}
                onEdit={() => setForm({ ac: 'property', editing: h })}
                onSave={onSave}
                masked={masked}
              />
            ))}
          </div>
        )}
      </div>

      {/* Other assets section */}
      {others.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-secondary flex items-center gap-1.5 mb-2">
            <i className="ti ti-dots" style={{ fontSize: 14, color: '#6b7280' }} aria-hidden="true" />
            Other Assets
          </p>
          <div className="flex flex-col gap-3">
            {others.map((h) => {
              const currentVal = h.currentValue ?? h.investedAmount;
              const gain = currentVal - h.investedAmount;
              const gainPct = h.investedAmount > 0 ? (gain / h.investedAmount) * 100 : 0;
              const stale = realAssetIsStale(h.lastUpdatedAt);
              return (
                <button
                  key={h.id}
                  onClick={() => setForm({ ac: 'other', editing: h })}
                  className="surface rounded-2xl px-4 py-3 flex items-center gap-3 w-full text-left"
                >
                  <IconBadge icon="ti-dots" color="#6b7280" bg="#6b728015" size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-primary truncate">{h.name}</p>
                    <p className="text-[10px] text-tertiary">
                      {realAssetStalenessLabel(h.lastUpdatedAt)}
                      {stale ? ' · Stale' : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-primary">
                      {masked ? '••••' : `₹${currentVal.toLocaleString('en-IN')}`}
                    </p>
                    {!masked && (
                      <p className={`text-[10px] font-medium ${gain >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {gain >= 0 ? '+' : ''}
                        {gainPct.toFixed(1)}%
                      </p>
                    )}
                  </div>
                  <i className="ti ti-chevron-right text-tertiary" style={{ fontSize: 15 }} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {form?.ac === 'vehicle' && <VehicleModal editing={form.editing} onSave={save} onDelete={del} onClose={close} />}
      {form?.ac === 'property' && <PropertyModal editing={form.editing} onSave={save} onDelete={del} onClose={close} />}
      {form?.ac === 'other' && <OtherModal editing={form.editing} onSave={save} onDelete={del} onClose={close} />}
    </div>
  );
}
