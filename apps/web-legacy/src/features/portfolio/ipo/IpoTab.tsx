import { useState, useEffect, useMemo } from 'react';
import { EmptyState, Card } from '@/components/ui';
import { useIpos } from '@/core/ipo/useIpos';
import { fetchHistoricalListedIpos } from '@/core/ipo/ipoClient';
import type { IpoItem, IpoStatus } from '@/core/ipo/ipoTypes';
import {
  IPO_SUBTAB_ORDER,
  IPO_SUBTAB_META,
  formatLastUpdated,
  formatIpoDate,
  currentFyLabel,
  daysUntil
} from './ipoHelpers';
import { IpoDetailModal } from './IpoDetailModal';

// IPO tab: upcoming/open/closed/listed sub-tabs with GMP, subscription and a
// detail modal. Fully self-contained — owns its own data fetching and state.
export function IpoTab() {
  const [ipoSubTab, setIpoSubTab] = useState<IpoStatus>('upcoming');
  const [ipoShowMainboardOnly, setIpoShowMainboardOnly] = useState(false);
  const [ipoListedFy, setIpoListedFy] = useState<string>(currentFyLabel());
  const [ipoListedSearch, setIpoListedSearch] = useState('');
  const [historicalListedIpos, setHistoricalListedIpos] = useState<IpoItem[]>([]);
  const [historicalLoadedFy, setHistoricalLoadedFy] = useState<string | null>(null);
  const [selectedIpo, setSelectedIpo] = useState<IpoItem | null>(null);
  const ipos = useIpos();

  useEffect(() => {
    if (ipoSubTab !== 'listed') return;
    const fyStart = parseInt(ipoListedFy.match(/\d{4}/)?.[0] ?? '0', 10);
    if (!fyStart) return;
    let cancelled = false;
    fetchHistoricalListedIpos(fyStart)
      .then((items) => {
        if (!cancelled) {
          setHistoricalListedIpos(items);
          setHistoricalLoadedFy(ipoListedFy);
        }
      })
      .catch(() => {
        if (!cancelled) setHistoricalLoadedFy(ipoListedFy);
      });
    return () => {
      cancelled = true;
    };
  }, [ipoSubTab, ipoListedFy]);

  const historicalListedLoading = ipoSubTab === 'listed' && historicalLoadedFy !== ipoListedFy;
  const ipoSubList = ipoSubTab === 'listed' ? historicalListedIpos : ipos[ipoSubTab];
  const activeIpoMeta = IPO_SUBTAB_META[ipoSubTab];
  const ipoListedFyOptions = useMemo(() => {
    const now = new Date();
    const m = now.getMonth() + 1;
    const y = now.getFullYear();
    const start = m >= 4 ? y : y - 1;
    return Array.from({ length: 5 }, (_, i) => {
      const s = start - i;
      return `FY ${s}-${String(s + 1).slice(2)}`;
    });
  }, []);
  const ipoFilteredList = (() => {
    let list = ipoShowMainboardOnly ? ipoSubList.filter((i) => i.category === 'mainboard') : ipoSubList;
    if (ipoSubTab === 'listed') {
      const q = ipoListedSearch.trim().toLowerCase();
      if (q) list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    return list;
  })();

  return (
    <>
      <div>
        {/* Sub-tabs + refresh */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-theme">
          <div className="flex gap-1.5">
            {IPO_SUBTAB_ORDER.map((key) => {
              const { label } = IPO_SUBTAB_META[key];
              const count = key === 'listed' ? historicalListedIpos.length : ipos[key].length;
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
          {ipoSubTab !== 'listed' && (
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
          )}
        </div>

        {/* Last updated */}
        {ipos.lastUpdated && (
          <p className="text-[10px] text-tertiary px-4 pt-1.5 pb-0.5">
            {formatLastUpdated(ipos.lastUpdated)} · investorgain.com
          </p>
        )}

        {/* Listed tab: FY picker + search on one row */}
        {ipoSubTab === 'listed' && (
          <div className="flex items-center gap-2 px-4 pt-2.5 pb-0.5">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none flex-1 min-w-0">
              {ipoListedFyOptions.map((fy) => (
                <button
                  key={fy}
                  onClick={() => setIpoListedFy(fy)}
                  className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors"
                  style={
                    ipoListedFy === fy
                      ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                      : {
                          backgroundColor: 'var(--color-surface-secondary)',
                          color: 'var(--color-text-secondary)',
                          border: '0.5px solid var(--color-border)'
                        }
                  }
                >
                  {fy}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 rounded-xl px-2.5 py-1.5 border border-theme bg-surface-2">
              <i className="ti ti-search text-tertiary" style={{ fontSize: 13 }} aria-hidden="true" />
              <input
                type="text"
                value={ipoListedSearch}
                onChange={(e) => setIpoListedSearch(e.target.value)}
                placeholder="Search…"
                className="bg-transparent text-xs focus:outline-none text-primary placeholder:text-tertiary w-20"
              />
              {ipoListedSearch && (
                <button onClick={() => setIpoListedSearch('')} className="text-tertiary" aria-label="Clear search">
                  <i className="ti ti-x" style={{ fontSize: 11 }} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
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
        {(ipoSubTab === 'listed' ? historicalListedLoading : ipos.loading && ipos.all.length === 0) ? (
          <div className="p-10 text-center">
            <div
              className="w-6 h-6 border-2 rounded-full animate-spin mx-auto"
              style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
            />
            <p className="text-sm mt-3 text-tertiary">Fetching IPO data…</p>
          </div>
        ) : ipoFilteredList.length === 0 ? (
          <EmptyState
            icon={activeIpoMeta.icon}
            title={
              ipoShowMainboardOnly && ipoSubList.length > 0
                ? 'No mainboard IPOs in this category.'
                : activeIpoMeta.emptyMessage
            }
          />
        ) : (
          <div className="px-4 py-3 flex flex-col gap-3">
            {ipoFilteredList.map((ipo) => {
              const catColor = ipo.category === 'mainboard' ? '#6366f1' : '#f59e0b';
              const catLabel = ipo.category === 'mainboard' ? 'MAIN' : 'SME';
              const closingDays = daysUntil(ipo.closeDate);
              const safeGmpPct = !ipo.gmpPercent || isNaN(ipo.gmpPercent) ? 0 : ipo.gmpPercent;
              const gmpColor =
                ipo.gmpValue !== null && ipo.gmpValue > 0
                  ? '#10b981'
                  : ipo.gmpValue !== null && ipo.gmpValue < 0
                    ? '#ef4444'
                    : 'var(--color-text-tertiary)';

              return (
                <Card key={ipo.id} padding="sm" radius="md" onClick={() => setSelectedIpo(ipo)}>
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
                </Card>
              );
            })}
          </div>
        )}
      </div>
      {selectedIpo && <IpoDetailModal ipo={selectedIpo} onClose={() => setSelectedIpo(null)} />}
    </>
  );
}
