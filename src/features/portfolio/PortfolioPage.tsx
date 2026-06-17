import { useState, useMemo, useEffect } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import { holdingsRepo } from '@/core/db/repositories';
import { fetchMfNav, fetchStockPrice } from '@/core/db/priceCache';
import { useRepository } from '@/hooks/useRepository';
import type { AssetClass, Holding } from '@/core/db/types';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { HoldingForm } from './HoldingForm';
import { useIpos } from '@/core/ipo/useIpos';
import { fetchIpoSubscription } from '@/core/ipo/ipoClient';
import type { IpoItem, IpoStatus, IpoSubDetail } from '@/core/ipo/ipoTypes';

const ASSET_META: Record<AssetClass, { label: string; icon: string; color: string }> = {
  mf: { label: 'Mutual Funds', icon: 'ti-chart-donut', color: '#6366f1' },
  stock: { label: 'Stocks', icon: 'ti-trending-up', color: '#0ea5e9' },
  fd: { label: 'FD / RD', icon: 'ti-building-bank', color: '#f59e0b' },
  nps: { label: 'NPS', icon: 'ti-building-community', color: '#10b981' },
  ppf: { label: 'PPF / EPF', icon: 'ti-safe', color: '#8b5cf6' },
  gold: { label: 'Gold', icon: 'ti-coin', color: '#d97706' },
  other: { label: 'Other', icon: 'ti-dots', color: '#6b7280' }
};

const ASSET_ORDER: AssetClass[] = ['mf', 'stock', 'fd', 'nps', 'ppf', 'gold', 'other'];

const IPO_SUBTAB_ORDER: IpoStatus[] = ['upcoming', 'open', 'closed', 'listed'];

const IPO_SUBTAB_META: Record<IpoStatus, { label: string; icon: string; emptyMessage: string }> = {
  upcoming: { label: 'Upcoming', icon: 'ti-calendar-event', emptyMessage: 'No upcoming IPOs right now.' },
  open: { label: 'Open', icon: 'ti-door-enter', emptyMessage: 'No IPOs are currently open for subscription.' },
  closed: { label: 'Closed', icon: 'ti-clock-hour-4', emptyMessage: 'No closed IPOs awaiting listing.' },
  listed: { label: 'Listed', icon: 'ti-list-check', emptyMessage: 'No recently listed IPOs.' }
};

function effectiveValue(h: Holding): number {
  return h.currentValue ?? h.investedAmount;
}

function formatLastUpdated(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Updated just now';
  return `Updated ${new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

function formatIpoDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const close = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  close.setHours(0, 0, 0, 0);
  const diff = Math.ceil((close.getTime() - today.getTime()) / 86_400_000);
  return diff >= 0 ? diff : null;
}

function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <p className="text-xs text-tertiary mb-0.5">{label}</p>
      <p className="text-sm font-medium text-primary" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </p>
    </div>
  );
}

function IpoDetailModal({ ipo, onClose }: { ipo: IpoItem; onClose: () => void }) {
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
  const safeGmpPct = isNaN(ipo.gmpPercent) ? 0 : ipo.gmpPercent;
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
                {ipo.price ? <DetailRow label="Price" value={`₹${ipo.price}/sh`} /> : null}
                {ipo.lotSize ? <DetailRow label="Lot Size" value={`${ipo.lotSize} sh`} /> : null}
                {minInvestment ? <DetailRow label="Min Invest" value={formatCurrency(minInvestment)} /> : null}
                {ipo.issueSize ? <DetailRow label="Issue Size" value={ipo.issueSize} /> : null}
              </div>
            </div>
          )}

          {/* Timeline — 4-col */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2.5">Timeline</p>
            {(ipo.openDate ?? ipo.closeDate ?? ipo.boaDate ?? ipo.listingDate) ? (
              <div className="grid grid-cols-4 gap-2">
                {ipo.openDate ? <DetailRow label="Opens" value={formatIpoDate(ipo.openDate)} /> : null}
                {ipo.closeDate ? <DetailRow label="Closes" value={formatIpoDate(ipo.closeDate)} /> : null}
                {ipo.boaDate ? <DetailRow label="Allotment" value={formatIpoDate(ipo.boaDate)} /> : null}
                {ipo.listingDate ? <DetailRow label="Listing" value={formatIpoDate(ipo.listingDate)} /> : null}
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
                {ipo.listingPrice ? <DetailRow label="List Price" value={`₹${ipo.listingPrice}`} /> : null}
                {ipo.listingGain !== null ? (
                  <DetailRow
                    label="Listing Gain"
                    value={`${ipo.listingGain >= 0 ? '+' : ''}${ipo.listingGain.toFixed(1)}%`}
                    valueColor={ipo.listingGain >= 0 ? '#10b981' : '#ef4444'}
                  />
                ) : null}
                {safeGmpPct !== 0 ? (
                  <DetailRow label="GMP Was" value={`~${safeGmpPct > 0 ? '+' : ''}${safeGmpPct.toFixed(1)}%`} />
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
                    <DetailRow label="QIB" value={lastRow.qib} />
                    <DetailRow label="HNI ≥₹10L" value={lastRow.niiBig} />
                    <DetailRow label="HNI <₹10L" value={lastRow.niiSmall} />
                    <DetailRow label="Retail" value={lastRow.rii} />
                    <DetailRow label="Overall" value={lastRow.total} valueColor="var(--color-primary)" />
                    {lastRow.emp !== '—' && <DetailRow label="Employee" value={lastRow.emp} />}
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

export function PortfolioPage() {
  const { mode } = usePrivacy();
  const { items: holdings, save: saveHolding, remove: removeHolding } = useRepository(holdingsRepo);

  const [activeTab, setActiveTab] = useState<'holdings' | 'allocation' | 'ipo'>('holdings');
  const [ipoSubTab, setIpoSubTab] = useState<IpoStatus>('upcoming');
  const [ipoShowMainboardOnly, setIpoShowMainboardOnly] = useState(false);
  const [selectedIpo, setSelectedIpo] = useState<IpoItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const ipos = useIpos();

  const totalInvested = useMemo(() => holdings.reduce((s, h) => s + h.investedAmount, 0), [holdings]);
  const totalCurrent = useMemo(() => holdings.reduce((s, h) => s + effectiveValue(h), 0), [holdings]);
  const overallReturn = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;

  const grouped = useMemo(() => {
    const map = new Map<AssetClass, Holding[]>();
    for (const h of holdings) {
      const arr = map.get(h.assetClass) ?? [];
      arr.push(h);
      map.set(h.assetClass, arr);
    }
    return ASSET_ORDER.filter((ac) => map.has(ac)).map((ac) => ({
      assetClass: ac,
      meta: ASSET_META[ac],
      items: map.get(ac) ?? []
    }));
  }, [holdings]);

  const allocation = useMemo(() => {
    if (totalCurrent === 0) return [];
    return ASSET_ORDER.filter((ac) => grouped.some((g) => g.assetClass === ac)).map((ac) => {
      const value = holdings.filter((h) => h.assetClass === ac).reduce((s, h) => s + effectiveValue(h), 0);
      return {
        assetClass: ac,
        meta: ASSET_META[ac],
        value,
        pct: (value / totalCurrent) * 100
      };
    });
  }, [grouped, holdings, totalCurrent]);

  function openAdd() {
    setEditingHolding(null);
    setShowForm(true);
  }

  function openEdit(h: Holding) {
    setEditingHolding(h);
    setShowForm(true);
  }

  async function handleSave(holding: Holding) {
    await saveHolding(holding);
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    await removeHolding(id);
    setShowForm(false);
  }

  function handleRefreshPrices() {
    setRefreshing(true);
    const updates: Promise<void>[] = holdings
      .filter((h) => (h.assetClass === 'mf' && h.schemeCode) || (h.assetClass === 'stock' && h.symbol))
      .map((h) => {
        if (h.assetClass === 'mf' && h.schemeCode) {
          return fetchMfNav(h.schemeCode).then((nav) => {
            if (nav === null) return;
            return saveHolding({
              ...h,
              currentPrice: nav,
              ...(h.units != null ? { currentValue: h.units * nav } : {}),
              updatedAt: Date.now()
            });
          });
        }
        if (h.assetClass === 'stock' && h.symbol) {
          return fetchStockPrice(h.symbol).then((price) => {
            if (price === null) return;
            return saveHolding({
              ...h,
              currentPrice: price,
              ...(h.units != null ? { currentValue: h.units * price } : {}),
              updatedAt: Date.now()
            });
          });
        }
        return Promise.resolve();
      });

    Promise.all(updates)
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }

  const hasLivePriceRefresh = holdings.some(
    (h) => (h.assetClass === 'mf' && h.schemeCode) || (h.assetClass === 'stock' && h.symbol)
  );
  const ipoSubList = ipos[ipoSubTab];
  const activeIpoMeta = IPO_SUBTAB_META[ipoSubTab];
  const ipoFilteredList = ipoShowMainboardOnly ? ipoSubList.filter((i) => i.category === 'mainboard') : ipoSubList;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-theme">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-primary">Portfolio</h2>
          {activeTab !== 'ipo' && hasLivePriceRefresh && (
            <button
              onClick={handleRefreshPrices}
              disabled={refreshing}
              className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border border-theme text-secondary disabled:opacity-50"
            >
              <i
                className={`ti ti-refresh ${refreshing ? 'animate-spin' : ''}`}
                style={{ fontSize: 13 }}
                aria-hidden="true"
              />
              {refreshing ? 'Fetching…' : 'Refresh prices'}
            </button>
          )}
        </div>
        {activeTab !== 'ipo' && holdings.length > 0 && (
          <div className="flex items-baseline gap-3 mt-1">
            <p className="text-sm text-secondary">{mode === 'open' ? formatCurrency(totalCurrent) : '••••'}</p>
            <span className={`text-xs font-medium ${overallReturn >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {overallReturn >= 0 ? '+' : ''}
              {formatPercent(overallReturn)}
            </span>
          </div>
        )}
      </div>

      {/* Main tabs */}
      <div className="flex px-4 border-b border-theme">
        {(['holdings', 'allocation', 'ipo'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="py-2.5 mr-5 text-sm font-medium border-b-2 -mb-px transition-colors"
            style={
              activeTab === tab
                ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }
                : { borderColor: 'transparent', color: 'var(--color-text-secondary)' }
            }
          >
            {tab === 'ipo' ? 'IPO' : tab === 'allocation' ? 'Allocation' : 'Holdings'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        {/* ── Holdings tab ── */}
        {activeTab === 'holdings' && (
          <div>
            {holdings.length === 0 ? (
              <div className="p-10 text-center">
                <i className="ti ti-chart-bar text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
                <p className="text-sm mt-3 text-tertiary">No holdings yet. Tap + to add your first investment.</p>
              </div>
            ) : (
              <div className="py-2">
                {grouped.map((group) => (
                  <div key={group.assetClass}>
                    {/* Group header */}
                    <div className="px-4 py-2 flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded-md flex items-center justify-center"
                        style={{ backgroundColor: `${group.meta.color}18` }}
                      >
                        <i
                          className={`ti ${group.meta.icon}`}
                          style={{ fontSize: 12, color: group.meta.color }}
                          aria-hidden="true"
                        />
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
                        {group.meta.label}
                      </span>
                    </div>
                    {/* Holdings in this group */}
                    {group.items.map((h) => {
                      const current = effectiveValue(h);
                      const gain = current - h.investedAmount;
                      const gainPct = h.investedAmount > 0 ? (gain / h.investedAmount) * 100 : 0;
                      const hasLivePrice = h.currentPrice != null;

                      return (
                        <button
                          key={h.id}
                          onClick={() => openEdit(h)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-theme"
                        >
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: `${group.meta.color}15` }}
                          >
                            <i
                              className={`ti ${group.meta.icon}`}
                              style={{ fontSize: 18, color: group.meta.color }}
                              aria-hidden="true"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate text-primary">{h.name}</p>
                            <p className="text-xs mt-0.5 text-tertiary">
                              Invested: {mode === 'open' ? formatCurrency(h.investedAmount) : '••••'}
                              {hasLivePrice && (
                                <span className="ml-1.5 text-[10px] font-medium text-[#00a86b]">live</span>
                              )}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-semibold text-primary">
                              {mode === 'open' ? formatCurrency(current) : '••••'}
                            </p>
                            <p className={`text-xs font-medium ${gain >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {gain >= 0 ? '+' : ''}
                              {formatPercent(gainPct)}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Allocation tab ── */}
        {activeTab === 'allocation' && (
          <div className="px-4 py-4">
            {allocation.length === 0 ? (
              <p className="text-sm text-center mt-8 text-tertiary">Add holdings to see your allocation.</p>
            ) : (
              <>
                {/* Stacked bar */}
                <div className="h-3 rounded-full overflow-hidden flex mb-4">
                  {allocation.map((a) => (
                    <div key={a.assetClass} style={{ width: `${a.pct}%`, backgroundColor: a.meta.color }} />
                  ))}
                </div>

                {/* Breakdown rows */}
                <div className="flex flex-col gap-3">
                  {allocation.map((a) => (
                    <div key={a.assetClass} className="rounded-xl p-3 surface">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-md flex items-center justify-center"
                            style={{ backgroundColor: `${a.meta.color}18` }}
                          >
                            <i
                              className={`ti ${a.meta.icon}`}
                              style={{ fontSize: 13, color: a.meta.color }}
                              aria-hidden="true"
                            />
                          </div>
                          <span className="text-sm font-medium text-primary">{a.meta.label}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-semibold text-primary">
                            {mode === 'open' ? formatCurrency(a.value) : '••••'}
                          </span>
                          <span className="text-xs ml-2 text-tertiary">{formatPercent(a.pct, 0)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden bg-surface-3">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${a.pct}%`, backgroundColor: a.meta.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary footer */}
                <div className="mt-4 rounded-xl p-3 flex justify-between text-xs bg-surface-2">
                  <span className="text-secondary">
                    Total invested:{' '}
                    <span className="font-medium text-primary">
                      {mode === 'open' ? formatCurrency(totalInvested) : '••••'}
                    </span>
                  </span>
                  <span className="text-secondary">
                    Current:{' '}
                    <span className="font-medium text-primary">
                      {mode === 'open' ? formatCurrency(totalCurrent) : '••••'}
                    </span>
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── IPO tab ── */}
        {activeTab === 'ipo' && (
          <div>
            {/* Sub-tabs + refresh */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-theme">
              <div className="flex gap-1.5">
                {IPO_SUBTAB_ORDER.map((key) => {
                  const { label } = IPO_SUBTAB_META[key];
                  const count = ipos[key].length;
                  return (
                    <button
                      key={key}
                      onClick={() => setIpoSubTab(key)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                      style={
                        ipoSubTab === key
                          ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                          : { backgroundColor: 'var(--color-surface-secondary)', color: 'var(--color-text-secondary)' }
                      }
                    >
                      {label}
                      {count > 0 && (
                        <span
                          className="text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none"
                          style={
                            ipoSubTab === key
                              ? { backgroundColor: 'rgba(255,255,255,0.25)', color: '#fff' }
                              : {
                                  backgroundColor: 'var(--color-surface-tertiary)',
                                  color: 'var(--color-text-tertiary)'
                                }
                          }
                        >
                          {count > 9 ? '9+' : count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={ipos.refresh}
                disabled={ipos.refreshing || ipos.loading}
                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border border-theme text-secondary disabled:opacity-40 ml-2 flex-shrink-0"
                aria-label="Refresh IPO data"
              >
                <i
                  className={`ti ti-refresh ${ipos.refreshing ? 'animate-spin' : ''}`}
                  style={{ fontSize: 13 }}
                  aria-hidden="true"
                />
                {ipos.refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>

            {/* Last updated */}
            {ipos.lastUpdated && (
              <p className="text-[10px] text-tertiary px-4 pt-1.5 pb-0.5">
                {formatLastUpdated(ipos.lastUpdated)} · investorgain.com
              </p>
            )}

            {/* Mainboard / All filter */}
            {ipoSubList.length > 0 && (
              <div className="flex items-center px-4 pt-2.5 pb-0.5">
                {(['all', 'mainboard'] as const).map((f) => {
                  const active = f === 'all' ? !ipoShowMainboardOnly : ipoShowMainboardOnly;
                  return (
                    <button
                      key={f}
                      onClick={() => setIpoShowMainboardOnly(f === 'mainboard')}
                      className="px-3 py-1 text-xs font-medium border border-theme first:rounded-l-full last:rounded-r-full -mr-px"
                      style={
                        active
                          ? {
                              backgroundColor: 'var(--color-primary)',
                              color: '#fff',
                              borderColor: 'var(--color-primary)',
                              zIndex: 1
                            }
                          : { backgroundColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }
                      }
                    >
                      {f === 'all' ? 'All' : 'Mainboard'}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Content */}
            {ipos.loading && ipos.all.length === 0 ? (
              <div className="p-10 text-center">
                <div
                  className="w-6 h-6 border-2 rounded-full animate-spin mx-auto"
                  style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
                />
                <p className="text-sm mt-3 text-tertiary">Fetching IPO data…</p>
              </div>
            ) : ipoFilteredList.length === 0 ? (
              <div className="p-10 text-center">
                <i className={`ti ${activeIpoMeta.icon} text-tertiary`} style={{ fontSize: 44 }} aria-hidden="true" />
                <p className="text-sm mt-3 text-tertiary">
                  {ipoShowMainboardOnly && ipoSubList.length > 0
                    ? 'No mainboard IPOs in this category.'
                    : activeIpoMeta.emptyMessage}
                </p>
              </div>
            ) : (
              <div className="px-4 py-3 flex flex-col gap-3">
                {ipoFilteredList.map((ipo) => {
                  const catColor = ipo.category === 'mainboard' ? '#6366f1' : '#f59e0b';
                  const catLabel = ipo.category === 'mainboard' ? 'MAIN' : 'SME';
                  const closingDays = daysUntil(ipo.closeDate);
                  const safeGmpPct = isNaN(ipo.gmpPercent) ? 0 : ipo.gmpPercent;
                  const gmpColor =
                    ipo.gmpValue !== null && ipo.gmpValue > 0
                      ? '#10b981'
                      : ipo.gmpValue !== null && ipo.gmpValue < 0
                        ? '#ef4444'
                        : 'var(--color-text-tertiary)';

                  return (
                    <button
                      key={ipo.id}
                      className="surface rounded-xl p-3.5 text-left w-full"
                      onClick={() => setSelectedIpo(ipo)}
                    >
                      <div className="flex gap-3">
                        {/* Left column: name, price/lot, subscription, GMP/gain */}
                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                          {/* Name + category badge inline */}
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <p className="text-sm font-semibold text-primary leading-snug">{ipo.name}</p>
                            <span
                              className="text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded flex-shrink-0"
                              style={{ backgroundColor: `${catColor}18`, color: catColor }}
                            >
                              {catLabel}
                            </span>
                          </div>

                          {/* Price · Lot · Issue size */}
                          {(ipo.price || ipo.lotSize || ipo.issueSize) && (
                            <p className="text-xs text-secondary">
                              {[
                                ipo.price ? `₹${ipo.price}/sh` : null,
                                ipo.lotSize ? `Lot ${ipo.lotSize}` : null,
                                ipo.issueSize ?? null
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}

                          {/* Subscription — open and closed */}
                          {(ipo.status === 'open' || ipo.status === 'closed') && ipo.subscription && (
                            <p className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>
                              {ipo.subscription} subscribed
                            </p>
                          )}

                          {/* GMP row (upcoming/open/closed) or listing gain (listed) */}
                          {ipo.status === 'listed' ? (
                            ipo.listingGain !== null && (
                              <p
                                className="text-xs font-semibold"
                                style={{ color: ipo.listingGain >= 0 ? '#10b981' : '#ef4444' }}
                              >
                                Listed {ipo.listingGain >= 0 ? '+' : ''}
                                {ipo.listingGain.toFixed(1)}%
                              </p>
                            )
                          ) : (
                            <p className="text-xs">
                              <span className="text-tertiary">GMP: </span>
                              {ipo.gmpValue !== null ? (
                                <span className="font-medium" style={{ color: gmpColor }}>
                                  ₹{Math.abs(ipo.gmpValue)} ({safeGmpPct > 0 ? '+' : ''}
                                  {safeGmpPct.toFixed(1)}%)
                                  {ipo.status === 'upcoming' && (
                                    <span className="text-tertiary font-normal text-[10px] ml-1">est.</span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-tertiary">—</span>
                              )}
                            </p>
                          )}
                        </div>

                        {/* Right column: dates stacked, right-aligned */}
                        <div className="flex flex-col gap-1 text-right flex-shrink-0 items-end">
                          {ipo.status === 'upcoming' &&
                            (ipo.openDate ? (
                              <p className="text-xs text-tertiary whitespace-nowrap">
                                {formatIpoDate(ipo.openDate)} → {formatIpoDate(ipo.closeDate)}
                              </p>
                            ) : (
                              <p className="text-xs text-tertiary">Dates TBA</p>
                            ))}

                          {ipo.status === 'open' && (
                            <>
                              <p className="text-xs text-tertiary whitespace-nowrap">
                                {formatIpoDate(ipo.openDate)} → {formatIpoDate(ipo.closeDate)}
                              </p>
                              {closingDays !== null && (
                                <p className="text-xs font-semibold" style={{ color: '#10b981' }}>
                                  {closingDays === 0 ? 'Closes today' : `${closingDays}d left`}
                                </p>
                              )}
                            </>
                          )}

                          {ipo.status === 'closed' && (
                            <>
                              <p className="text-xs text-tertiary whitespace-nowrap">
                                {formatIpoDate(ipo.openDate)} → {formatIpoDate(ipo.closeDate)}
                              </p>
                              {ipo.boaDate && (
                                <p className="text-xs text-tertiary whitespace-nowrap">
                                  Allotment: {formatIpoDate(ipo.boaDate)}
                                </p>
                              )}
                              {ipo.listingDate && (
                                <p className="text-xs text-tertiary whitespace-nowrap">
                                  Listing: {formatIpoDate(ipo.listingDate)}
                                </p>
                              )}
                            </>
                          )}

                          {ipo.status === 'listed' && (
                            <>
                              {ipo.listingDate && (
                                <p className="text-xs text-tertiary whitespace-nowrap">
                                  Listed: {formatIpoDate(ipo.listingDate)}
                                </p>
                              )}
                              {ipo.listingPrice && (
                                <p className="text-xs text-tertiary whitespace-nowrap">At: ₹{ipo.listingPrice}</p>
                              )}
                              {safeGmpPct !== 0 && (
                                <p className="text-xs text-tertiary whitespace-nowrap">
                                  GMP was: ~{safeGmpPct > 0 ? '+' : ''}
                                  {safeGmpPct.toFixed(1)}%
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* FAB — add holding (hidden on IPO tab) */}
      {activeTab !== 'ipo' && (
        <button
          onClick={openAdd}
          className="fixed w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white z-10"
          style={{
            bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
            right: '1rem',
            backgroundColor: 'var(--color-primary)'
          }}
          aria-label="Add holding"
        >
          <i className="ti ti-plus" style={{ fontSize: 24 }} aria-hidden="true" />
        </button>
      )}

      {showForm && (
        <HoldingForm
          editing={editingHolding}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setShowForm(false)}
        />
      )}

      {selectedIpo && <IpoDetailModal ipo={selectedIpo} onClose={() => setSelectedIpo(null)} />}
    </div>
  );
}
