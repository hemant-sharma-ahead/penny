import { useState } from 'react';
import { Button, Card, IconBadge } from '@/components/ui';
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
    <div className="flex items-start justify-between py-2.5 border-b border-theme last:border-0 gap-3">
      <p className="text-xs text-tertiary shrink-0">{label}</p>
      <p className="text-xs font-medium text-primary text-right">{display}</p>
    </div>
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
  const meta = holding.assetMeta ?? {};
  const [showUpdateSheet, setShowUpdateSheet] = useState(false);
  const currentVal = holding.currentValue ?? holding.investedAmount;
  const gain = holding.investedAmount > 0 ? currentVal - holding.investedAmount : null;
  const gainPct = gain !== null && holding.investedAmount > 0 ? (gain / holding.investedAmount) * 100 : null;
  const stale = realAssetIsStale(holding.lastUpdatedAt);

  const fuelColors: Record<string, string> = {
    PETROL: '#f59e0b',
    DIESEL: '#64748b',
    ELECTRIC: '#10b981',
    CNG: '#3b82f6',
    HYBRID: '#8b5cf6'
  };
  const fuelKey = (meta.vehicleFuelType ?? '').toUpperCase();
  const fuelColor = fuelColors[fuelKey] ?? '#64748b';

  function dateStr(ms?: number | null) {
    if (!ms) return null;
    return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const pendingChallans = meta.vehicleChallanPending ?? 0;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-[390px] rounded-2xl flex flex-col bg-surface"
        style={{ maxHeight: 'calc(100vh - 120px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-theme flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <IconBadge icon="ti-car" color="#3b82f6" bg="#3b82f615" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-primary leading-snug">
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
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-tertiary shrink-0">
            <i className="ti ti-x" style={{ fontSize: 18 }} aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-5">
          {/* Validity badges */}
          {(meta.vehicleInsuranceUpto || meta.vehiclePuccUpto || meta.vehicleRcValidUpto) && (
            <div className="flex gap-2">
              {meta.vehicleInsuranceUpto && <VehicleValidityBadge label="Insurance" upto={meta.vehicleInsuranceUpto} />}
              {meta.vehiclePuccUpto && <VehicleValidityBadge label="PUC" upto={meta.vehiclePuccUpto} />}
              {meta.vehicleRcValidUpto && <VehicleValidityBadge label="RC valid" upto={meta.vehicleRcValidUpto} />}
            </div>
          )}

          {/* Value tiles */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface-secondary)' }}>
              <p className="text-[10px] text-tertiary mb-0.5">Current value</p>
              <p className="text-base font-bold text-primary tabular-nums">
                {masked ? '••••' : currentVal > 0 ? `₹${currentVal.toLocaleString('en-IN')}` : '—'}
              </p>
              {stale && (
                <p className="text-[9px] mt-0.5 font-medium" style={{ color: '#f59e0b' }}>
                  Needs update
                </p>
              )}
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-surface-secondary)' }}>
              <p className="text-[10px] text-tertiary mb-0.5">Purchase price</p>
              <p className="text-base font-bold text-primary tabular-nums">
                {masked
                  ? '••••'
                  : holding.investedAmount > 0
                    ? `₹${holding.investedAmount.toLocaleString('en-IN')}`
                    : '—'}
              </p>
              {gainPct !== null && (
                <p className={`text-[9px] mt-0.5 font-medium ${gainPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {gainPct >= 0 ? '+' : ''}
                  {gainPct.toFixed(1)}%
                </p>
              )}
            </div>
          </div>

          {/* Vehicle identity */}
          <div>
            <p className="text-[10px] font-semibold text-tertiary uppercase tracking-wide mb-1.5">Vehicle</p>
            <div className="surface rounded-xl px-3">
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
            </div>
          </div>

          {/* Engine & specs */}
          {(meta.vehicleCubicCap ||
            meta.vehicleNorms ||
            meta.vehicleSeatCap ||
            meta.vehicleUnladenWeight ||
            meta.vehicleGrossWeight) && (
            <div>
              <p className="text-[10px] font-semibold text-tertiary uppercase tracking-wide mb-1.5">Engine & specs</p>
              <div className="surface rounded-xl px-3">
                <VehicleDetailRow mode={mode} label="Engine capacity (CC)" value={meta.vehicleCubicCap} />
                <VehicleDetailRow mode={mode} label="Fuel type" value={meta.vehicleFuelType} />
                <VehicleDetailRow mode={mode} label="Emission norms" value={meta.vehicleNorms} />
                <VehicleDetailRow mode={mode} label="Seating capacity" value={meta.vehicleSeatCap} />
                <VehicleDetailRow mode={mode} label="Unladen weight (kg)" value={meta.vehicleUnladenWeight} />
                <VehicleDetailRow mode={mode} label="Gross vehicle weight (kg)" value={meta.vehicleGrossWeight} />
              </div>
            </div>
          )}

          {/* Registration */}
          <div>
            <p className="text-[10px] font-semibold text-tertiary uppercase tracking-wide mb-1.5">Registration</p>
            <div className="surface rounded-xl px-3">
              <VehicleDetailRow mode={mode} label="Reg number" value={meta.vehicleRegNumber} masked />
              <VehicleDetailRow mode={mode} label="Registration date" value={meta.vehicleRegDate} />
              <VehicleDetailRow mode={mode} label="RTO" value={meta.vehicleRtoLocation} />
              <VehicleDetailRow mode={mode} label="RC status" value={meta.vehicleRcStatus} />
              <VehicleDetailRow mode={mode} label="RC valid upto" value={dateStr(meta.vehicleRcValidUpto)} />
              <VehicleDetailRow mode={mode} label="Fitness upto" value={dateStr(meta.vehicleFitnessUpto)} />
            </div>
          </div>

          {/* Compliance */}
          <div>
            <p className="text-[10px] font-semibold text-tertiary uppercase tracking-wide mb-1.5">Compliance</p>
            <div className="surface rounded-xl px-3">
              <VehicleDetailRow mode={mode} label="Insurance company" value={meta.vehicleInsuranceCompany} />
              <VehicleDetailRow mode={mode} label="Policy number" value={meta.vehicleInsurancePolicyNo} masked />
              <VehicleDetailRow mode={mode} label="Insurance valid upto" value={dateStr(meta.vehicleInsuranceUpto)} />
              <VehicleDetailRow mode={mode} label="PUC certificate no." value={meta.vehiclePuccNo} masked />
              <VehicleDetailRow mode={mode} label="PUC valid upto" value={dateStr(meta.vehiclePuccUpto)} />
            </div>
          </div>

          {/* Owner */}
          {(meta.vehicleOwnerName || meta.vehiclePresentAddress) && (
            <div>
              <p className="text-[10px] font-semibold text-tertiary uppercase tracking-wide mb-1.5">Owner</p>
              <div className="surface rounded-xl px-3">
                <VehicleDetailRow mode={mode} label="Name" value={meta.vehicleOwnerName} masked />
                <VehicleDetailRow mode={mode} label="Present address" value={meta.vehiclePresentAddress} masked />
                <VehicleDetailRow mode={mode} label="Permanent address" value={meta.vehiclePermanentAddress} masked />
                <VehicleDetailRow mode={mode} label="Financer / Hypothecation" value={meta.vehicleFinancer} />
              </div>
            </div>
          )}

          {/* Challans — individual records */}
          {meta.vehicleChallanFetchedAt && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-semibold text-tertiary uppercase tracking-wide">Traffic challans</p>
                {pendingChallans > 0 && (
                  <span
                    className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: '#ef444415', color: '#ef4444' }}
                  >
                    ⚠ {pendingChallans} pending
                  </span>
                )}
              </div>
              {(meta.vehicleChallanRecords ?? []).length > 0 ? (
                <div className="flex flex-col gap-2">
                  {(meta.vehicleChallanRecords ?? []).map((c, i) => {
                    const isPending = c.paymentStatus === 'UNPAID';
                    const isPaid = c.paymentStatus === 'PAID';
                    const isDisposed = c.paymentStatus === 'DISPOSED';
                    const statusColor = isPending ? '#ef4444' : isPaid ? '#10b981' : isDisposed ? '#6366f1' : '#94a3b8';
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
                      <Card key={i} padding="xs" radius="md" className="flex flex-col gap-2">
                        {/* Top row: challan no + amount */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-primary">{c.challanNo || `Challan ${i + 1}`}</p>
                            {fmtDate && <p className="text-[10px] text-tertiary">{fmtDate}</p>}
                          </div>
                          <p
                            className="text-sm font-bold tabular-nums shrink-0"
                            style={{ color: isPending ? '#ef4444' : 'var(--color-text-primary)' }}
                          >
                            {masked ? '••••' : `₹${c.amount.toLocaleString('en-IN')}`}
                          </p>
                        </div>
                        {/* Detail rows — always shown, — when absent */}
                        <div className="flex flex-col gap-1.5">
                          <div>
                            <p className="text-[9px] text-tertiary">Offense</p>
                            <p className="text-[10px] text-primary leading-snug">{c.offenceDetails || '—'}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-tertiary">Place</p>
                            <p className="text-[10px] text-primary">{c.challanPlace || '—'}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3">
                            <div>
                              <p className="text-[9px] text-tertiary">Court</p>
                              <p className="text-[10px] text-primary">{c.courtName || '—'}</p>
                            </div>
                            <div>
                              <p className="text-[9px] text-tertiary">RTO</p>
                              <p className="text-[10px] text-primary">{rtoLabel}</p>
                            </div>
                          </div>
                        </div>
                        {/* Status row — payment status + challan status + type all in one line */}
                        <div className="flex items-center gap-1.5 pt-1 border-t border-theme flex-wrap">
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: `${statusColor}15`, color: statusColor }}
                          >
                            {c.paymentStatus || 'UNKNOWN'}
                          </span>
                          {c.challanStatus && (
                            <span
                              className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                              style={{
                                backgroundColor: 'var(--color-surface-secondary)',
                                color: 'var(--color-text-tertiary)'
                              }}
                            >
                              {c.challanStatus}
                            </span>
                          )}
                          {c.challanType && (
                            <span
                              className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                              style={{
                                backgroundColor: 'var(--color-surface-secondary)',
                                color: 'var(--color-text-tertiary)'
                              }}
                            >
                              {c.challanType}
                            </span>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="surface rounded-xl px-3">
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
                </div>
              )}
            </div>
          )}

          {meta.vehicleRcFetchedAt && (
            <p className="text-[9px] text-tertiary text-center pb-1">
              RC data fetched {dateStr(meta.vehicleRcFetchedAt)}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-theme flex gap-2 shrink-0">
          <Button
            variant="secondary"
            size="lg"
            onClick={() => {
              onClose();
              onEdit();
            }}
            className="flex-1"
          >
            Edit
          </Button>
          <button
            onClick={() => setShowUpdateSheet(true)}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: '#3b82f6' }}
          >
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
            onClose();
          }}
          onClose={() => setShowUpdateSheet(false)}
        />
      )}
    </div>
  );
}
