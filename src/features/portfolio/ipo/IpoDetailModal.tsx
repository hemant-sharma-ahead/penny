import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/formatters';
import { fetchIpoSubscription } from '@/core/ipo/ipoClient';
import type { IpoItem, IpoStatus, IpoSubDetail } from '@/core/ipo/ipoTypes';
import { formatIpoDate } from './ipoHelpers';

function IpoStatCell({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <p className="text-xs text-tertiary mb-0.5">{label}</p>
      <p className="text-sm font-medium text-primary" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </p>
    </div>
  );
}

// ─── IpoDetailModal ───────────────────────────────────────────────────────────

export function IpoDetailModal({ ipo, onClose }: { ipo: IpoItem; onClose: () => void }) {
  const [subDetail, setSubDetail] = useState<IpoSubDetail | null>(null);
  // initialise to true so the spinner shows immediately — effect only calls setState in async callbacks
  const [subLoading, setSubLoading] = useState(() => ipo.status !== 'upcoming');

  useEffect(() => {
    if (ipo.status === 'upcoming') return;
    fetchIpoSubscription(ipo.id)
      .then((d) => setSubDetail(d))
      .finally(() => setSubLoading(false));
  }, [ipo.id, ipo.status]);

  const catColor = ipo.category === 'mainboard' ? '#6366f1' : '#f59e0b';
  const catLabel = ipo.category === 'mainboard' ? 'Mainboard' : 'SME';
  const safeGmpPct = !ipo.gmpPercent || isNaN(ipo.gmpPercent) ? 0 : ipo.gmpPercent;
  const minInvestment = ipo.price && ipo.lotSize ? ipo.price * ipo.lotSize : null;
  const statusMeta: Record<IpoStatus, { label: string; color: string }> = {
    upcoming: { label: 'Upcoming', color: '#f59e0b' },
    open: { label: 'Open', color: '#10b981' },
    closed: { label: 'Closed', color: '#6b7280' },
    listed: { label: 'Listed', color: '#6366f1' }
  };
  const sm = statusMeta[ipo.status];
  const lastRow = subDetail?.rows[subDetail.rows.length - 1];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-theme">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-primary leading-snug">{ipo.name}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span
                  className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: `${catColor}18`, color: catColor }}
                >
                  {catLabel}
                </span>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: `${sm.color}18`, color: sm.color }}
                >
                  {sm.label}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-tertiary"
              style={{ backgroundColor: 'var(--color-surface-secondary)' }}
              aria-label="Close"
            >
              <i className="ti ti-x" style={{ fontSize: 14 }} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-5">
          {/* Offer details — 4-col */}
          {(ipo.price ?? ipo.lotSize ?? ipo.issueSize) && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2.5">Offer Details</p>
              <div className="grid grid-cols-4 gap-2">
                {ipo.price ? <IpoStatCell label="Price" value={`₹${ipo.price}/sh`} /> : null}
                {ipo.lotSize ? <IpoStatCell label="Lot Size" value={`${ipo.lotSize} sh`} /> : null}
                {minInvestment ? <IpoStatCell label="Min Invest" value={formatCurrency(minInvestment)} /> : null}
                {ipo.issueSize ? <IpoStatCell label="Issue Size" value={ipo.issueSize} /> : null}
              </div>
            </div>
          )}

          {/* Timeline — 4-col */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2.5">Timeline</p>
            {(ipo.openDate ?? ipo.closeDate ?? ipo.boaDate ?? ipo.listingDate) ? (
              <div className="grid grid-cols-4 gap-2">
                {ipo.openDate ? <IpoStatCell label="Opens" value={formatIpoDate(ipo.openDate)} /> : null}
                {ipo.closeDate ? <IpoStatCell label="Closes" value={formatIpoDate(ipo.closeDate)} /> : null}
                {ipo.boaDate ? <IpoStatCell label="Allotment" value={formatIpoDate(ipo.boaDate)} /> : null}
                {ipo.listingDate ? <IpoStatCell label="Listing" value={formatIpoDate(ipo.listingDate)} /> : null}
              </div>
            ) : (
              <p className="text-sm text-tertiary">Dates not announced yet</p>
            )}
          </div>

          {/* GMP — non-listed */}
          {ipo.status !== 'listed' && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2.5">
                Grey Market Premium
              </p>
              {ipo.gmpValue !== null ? (
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-2xl font-bold tabular-nums"
                    style={{
                      color: ipo.gmpValue > 0 ? '#10b981' : ipo.gmpValue < 0 ? '#ef4444' : 'var(--color-text-tertiary)'
                    }}
                  >
                    ₹{Math.abs(ipo.gmpValue)}
                  </span>
                  <span
                    className="text-sm font-semibold tabular-nums"
                    style={{
                      color: safeGmpPct > 0 ? '#10b981' : safeGmpPct < 0 ? '#ef4444' : 'var(--color-text-tertiary)'
                    }}
                  >
                    ({safeGmpPct > 0 ? '+' : ''}
                    {safeGmpPct.toFixed(1)}%)
                  </span>
                  {ipo.status === 'upcoming' && <span className="text-xs text-tertiary">est.</span>}
                </div>
              ) : (
                <p className="text-sm text-tertiary">Not available</p>
              )}
            </div>
          )}

          {/* Listing performance — listed only */}
          {ipo.status === 'listed' && (ipo.listingPrice !== null || ipo.listingGain !== null || safeGmpPct !== 0) && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2.5">
                Listing Performance
              </p>
              <div className="grid grid-cols-3 gap-2">
                {ipo.listingPrice ? <IpoStatCell label="List Price" value={`₹${ipo.listingPrice}`} /> : null}
                {ipo.listingGain !== null ? (
                  <IpoStatCell
                    label="Listing Gain"
                    value={`${ipo.listingGain >= 0 ? '+' : ''}${ipo.listingGain.toFixed(1)}%`}
                    valueColor={ipo.listingGain >= 0 ? '#10b981' : '#ef4444'}
                  />
                ) : null}
                {safeGmpPct !== 0 ? (
                  <IpoStatCell label="GMP Was" value={`~${safeGmpPct > 0 ? '+' : ''}${safeGmpPct.toFixed(1)}%`} />
                ) : null}
              </div>
            </div>
          )}

          {/* Subscription — open / closed / listed */}
          {ipo.status !== 'upcoming' && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2.5">Subscription</p>

              {subLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <div
                    className="w-4 h-4 border-2 rounded-full animate-spin flex-shrink-0"
                    style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
                  />
                  <span className="text-xs text-tertiary">Fetching subscription data…</span>
                </div>
              ) : lastRow ? (
                <>
                  {/* Category breakdown — latest day */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <IpoStatCell label="QIB" value={lastRow.qib} />
                    <IpoStatCell label="HNI ≥₹10L" value={lastRow.niiBig} />
                    <IpoStatCell label="HNI <₹10L" value={lastRow.niiSmall} />
                    <IpoStatCell label="Retail" value={lastRow.rii} />
                    <IpoStatCell label="Overall" value={lastRow.total} valueColor="var(--color-primary)" />
                    {lastRow.emp !== '—' && <IpoStatCell label="Employee" value={lastRow.emp} />}
                  </div>

                  {/* Day-wise table */}
                  {(subDetail?.rows.length ?? 0) > 0 && (
                    <div className="rounded-xl overflow-hidden border border-theme">
                      <table className="w-full text-xs table-fixed">
                        <colgroup>
                          <col style={{ width: '28%' }} />
                          <col style={{ width: '18%' }} />
                          <col style={{ width: '18%' }} />
                          <col style={{ width: '18%' }} />
                          <col style={{ width: '18%' }} />
                        </colgroup>
                        <thead>
                          <tr style={{ backgroundColor: 'var(--color-surface-secondary)' }}>
                            <th className="text-left px-2 py-1.5 font-semibold text-tertiary">Day</th>
                            <th className="text-right px-1 py-1.5 font-semibold text-tertiary">QIB</th>
                            <th className="text-right px-1 py-1.5 font-semibold text-tertiary">HNI</th>
                            <th className="text-right px-1 py-1.5 font-semibold text-tertiary">Retail</th>
                            <th className="text-right px-2 py-1.5 font-semibold text-tertiary">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subDetail?.rows.map((row, i) => {
                            const isLast = i === (subDetail?.rows.length ?? 0) - 1;
                            return (
                              <tr
                                key={row.seq}
                                style={
                                  isLast
                                    ? { backgroundColor: 'color-mix(in srgb, var(--color-primary) 8%, transparent)' }
                                    : undefined
                                }
                              >
                                <td className="text-left px-2 py-1.5">
                                  <div className="font-medium text-primary">Day {row.seq}</div>
                                  <div className="text-[10px] text-tertiary">{row.bidDate}</div>
                                </td>
                                <td className="text-right px-1 py-1.5 tabular-nums text-primary">{row.qib}</td>
                                <td className="text-right px-1 py-1.5 tabular-nums text-primary">{row.nii}</td>
                                <td className="text-right px-1 py-1.5 tabular-nums text-primary">{row.rii}</td>
                                <td
                                  className="text-right px-2 py-1.5 tabular-nums font-semibold"
                                  style={{ color: 'var(--color-primary)' }}
                                >
                                  {row.total}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-tertiary">No subscription data available</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {ipo.detailPath && (
          <div className="px-4 pb-4">
            <a
              href={`https://investorgain.com${ipo.detailPath}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-sm font-medium text-secondary border border-theme"
              style={{ backgroundColor: 'var(--color-surface-secondary)' }}
            >
              View on InvestorGain
              <i className="ti ti-external-link" style={{ fontSize: 14 }} aria-hidden="true" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
