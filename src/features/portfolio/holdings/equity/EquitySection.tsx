import { useState } from 'react';
import { EmptyState, IconBadge } from '@/components/ui';
import type { AssetClass, Holding } from '@/core/db/types';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { effectiveValue, HOLDINGS_SUBTABS } from '@/features/portfolio/usePortfolioHoldings';
import { ASSET_META } from '@/features/portfolio/holdings/shared/registry';
import { StockModal } from './StockModal';
import { MfModal } from './MfModal';

interface EquitySectionProps {
  holdings: Holding[];
  assetClass: Extract<AssetClass, 'stock' | 'mf'>;
  mode: string;
  onSave: (holding: Holding) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

// Stocks / Mutual-funds slice: groups holdings by symbol/scheme with expandable
// lots, and owns its add (FAB) + edit modal.
export function EquitySection({ holdings, assetClass, mode, onSave, onRemove }: EquitySectionProps) {
  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<{ editing: Holding | null } | null>(null);

  const openEdit = (h: Holding) => setForm({ editing: h });
  const close = () => setForm(null);
  const save = async (h: Holding) => {
    await onSave(h);
    close();
  };
  const del = (id: string) => {
    void onRemove(id).then(close);
  };

  const cfg = HOLDINGS_SUBTABS.find((t) => t.assetClasses.includes(assetClass));
  const activeClass = form?.editing?.assetClass ?? assetClass;

  return (
    <>
      {holdings.length === 0 ? (
        <EmptyState icon={cfg?.icon ?? 'ti-wallet'} title={cfg?.emptyMessage ?? 'Nothing here yet.'} />
      ) : (
        <div className="py-2">
          {(() => {
            const stockGroups = (() => {
              const stockHoldings = holdings.filter((h) => h.assetClass === 'stock');
              if (stockHoldings.length === 0) return new Map<string, typeof stockHoldings>();
              const map = new Map<string, typeof stockHoldings>();
              for (const h of stockHoldings) {
                const key = (h.symbol ?? h.name).toUpperCase();
                const arr = map.get(key) ?? [];
                arr.push(h);
                map.set(key, arr);
              }
              return map;
            })();
            const renderedStockSymbols = new Set<string>();

            const mfGroups = (() => {
              const mfHoldings = holdings.filter((h) => h.assetClass === 'mf');
              if (mfHoldings.length === 0) return new Map<string, typeof mfHoldings>();
              const map = new Map<string, typeof mfHoldings>();
              for (const h of mfHoldings) {
                const key = (h.schemeCode ?? h.name).toString();
                const arr = map.get(key) ?? [];
                arr.push(h);
                map.set(key, arr);
              }
              return map;
            })();
            const renderedMfSchemes = new Set<string>();

            return holdings.map((h) => {
              const meta = ASSET_META[h.assetClass];

              if (h.assetClass === 'stock') {
                const symKey = (h.symbol ?? h.name).toUpperCase();
                if (renderedStockSymbols.has(symKey)) return null;
                renderedStockSymbols.add(symKey);

                const lots = stockGroups.get(symKey) ?? [h];
                const totalUnits = lots.reduce((s, l) => s + (l.units ?? 0), 0);
                const totalInvested = lots.reduce((s, l) => s + l.investedAmount, 0);
                const weightedAvg = totalUnits > 0 ? totalInvested / totalUnits : 0;
                const totalCurrent = lots.reduce((s, l) => s + effectiveValue(l), 0);
                const livePrice = lots.find((l) => l.currentPrice != null)?.currentPrice ?? null;
                const totalGain = totalCurrent - totalInvested;
                const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
                const totalGainColor = totalGain >= 0 ? '#10b981' : '#ef4444';
                const ticker = h.symbol ? h.symbol.replace(/\.(NS|BO)$/i, '') : null;
                const displayName = ticker ?? h.name;
                const companyName = h.name !== displayName ? h.name : '';
                const isMultiLot = lots.length > 1;
                const isExpanded = expandedSymbols.has(symKey);

                const handleGroupTap = () => {
                  if (isMultiLot) {
                    setExpandedSymbols((prev) => {
                      const next = new Set(prev);
                      if (next.has(symKey)) next.delete(symKey);
                      else next.add(symKey);
                      return next;
                    });
                  } else {
                    const firstLot = lots[0];
                    if (firstLot) openEdit(firstLot);
                  }
                };

                return (
                  <div key={symKey} className="border-b border-theme">
                    <button onClick={handleGroupTap} className="w-full px-4 py-3 text-left">
                      <div className="flex items-start gap-3">
                        <IconBadge
                          icon={meta.icon}
                          color={meta.color}
                          bg={`${meta.color}15`}
                          size="sm"
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-sm font-semibold text-primary tracking-wide truncate">{displayName}</p>
                              {isMultiLot && (
                                <span
                                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
                                >
                                  {lots.length} lots
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-primary flex-shrink-0">
                              {mode === 'open' ? formatCurrency(totalCurrent) : '••••'}
                            </p>
                          </div>
                          <div className="flex items-baseline justify-between gap-2 mt-0.5">
                            {companyName ? <p className="text-xs text-secondary truncate">{companyName}</p> : <span />}
                            <p className="text-xs font-medium flex-shrink-0" style={{ color: totalGainColor }}>
                              {mode === 'open'
                                ? `${totalGain >= 0 ? '+' : '−'}${formatCurrency(Math.abs(totalGain))} · ${totalGain >= 0 ? '+' : ''}${formatPercent(totalGainPct)}`
                                : '••••'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            <span className="text-[10px] text-tertiary">{totalUnits} shares</span>
                            {weightedAvg > 0 && (
                              <>
                                <span className="text-[9px] text-tertiary">·</span>
                                <span className="text-[10px] text-tertiary">
                                  Avg{' '}
                                  {mode === 'open'
                                    ? `₹${weightedAvg.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                                    : '••••'}
                                </span>
                              </>
                            )}
                            {livePrice != null && (
                              <>
                                <span className="text-[9px] text-tertiary">·</span>
                                <span className="text-[10px] font-medium" style={{ color: meta.color }}>
                                  {mode === 'open'
                                    ? `₹${livePrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                                    : '••••'}
                                  <span className="ml-0.5 opacity-60 text-[9px]">live</span>
                                </span>
                              </>
                            )}
                            {isMultiLot && (
                              <span className="ml-auto text-[10px] text-tertiary flex items-center gap-0.5">
                                <i
                                  className={`ti ${isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}`}
                                  style={{ fontSize: 11 }}
                                />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                    {isMultiLot && isExpanded && (
                      <div
                        className="mx-4 mb-3 rounded-xl overflow-hidden"
                        style={{ backgroundColor: 'var(--color-surface-secondary)' }}
                      >
                        {lots.map((lot, idx) => {
                          const lotCurrent = effectiveValue(lot);
                          const lotGain = lotCurrent - lot.investedAmount;
                          const lotGainPct = lot.investedAmount > 0 ? (lotGain / lot.investedAmount) * 100 : 0;
                          const lotGainColor = lotGain >= 0 ? '#10b981' : '#ef4444';
                          return (
                            <button
                              key={lot.id}
                              onClick={() => openEdit(lot)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-theme last:border-0"
                            >
                              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-secondary bg-surface">
                                {idx + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-primary">
                                  {lot.units} shares
                                  {lot.avgCostPrice != null && (
                                    <span className="text-tertiary">
                                      {' '}
                                      · Avg{' '}
                                      {mode === 'open'
                                        ? `₹${lot.avgCostPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                                        : '••••'}
                                    </span>
                                  )}
                                </p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-xs font-medium text-primary">
                                  {mode === 'open' ? formatCurrency(lotCurrent) : '••••'}
                                </p>
                                <p className="text-[10px]" style={{ color: lotGainColor }}>
                                  {lotGain >= 0 ? '+' : '−'}
                                  {formatPercent(Math.abs(lotGainPct))}
                                </p>
                              </div>
                              <i className="ti ti-pencil text-tertiary flex-shrink-0" style={{ fontSize: 13 }} />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              if (h.assetClass === 'mf') {
                const schemeKey = (h.schemeCode ?? h.name).toString();
                if (renderedMfSchemes.has(schemeKey)) return null;
                renderedMfSchemes.add(schemeKey);

                const lots = mfGroups.get(schemeKey) ?? [h];
                const totalUnits = lots.reduce((s, l) => s + (l.units ?? 0), 0);
                const totalInvested = lots.reduce((s, l) => s + l.investedAmount, 0);
                const weightedAvg = totalUnits > 0 ? totalInvested / totalUnits : 0;
                const totalCurrent = lots.reduce((s, l) => s + effectiveValue(l), 0);
                const liveNav = lots.find((l) => l.currentPrice != null)?.currentPrice ?? null;
                const mfGain = totalCurrent - totalInvested;
                const mfGainPct = totalInvested > 0 ? (mfGain / totalInvested) * 100 : 0;
                const gainColor = mfGain >= 0 ? '#10b981' : '#ef4444';
                const isMultiLot = lots.length > 1;
                const isExpanded = expandedSymbols.has(schemeKey);
                const mfSchemeCategory = h.assetMeta?.mfSchemeCategory ?? '';
                const mfFundHouse = h.assetMeta?.mfFundHouse ?? '';

                const handleGroupTap = () => {
                  if (isMultiLot) {
                    setExpandedSymbols((prev) => {
                      const next = new Set(prev);
                      if (next.has(schemeKey)) next.delete(schemeKey);
                      else next.add(schemeKey);
                      return next;
                    });
                  } else {
                    const firstLot = lots[0];
                    if (firstLot) openEdit(firstLot);
                  }
                };

                return (
                  <div key={schemeKey} className="border-b border-theme">
                    <button onClick={handleGroupTap} className="w-full px-4 py-3 text-left">
                      <div className="flex items-start gap-3">
                        <IconBadge
                          icon={meta.icon}
                          color={meta.color}
                          bg={`${meta.color}15`}
                          size="sm"
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-xs font-semibold text-primary truncate">{h.name}</p>
                              {isMultiLot && (
                                <span
                                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
                                >
                                  {lots.length} SIPs
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-primary flex-shrink-0">
                              {mode === 'open' ? formatCurrency(totalCurrent) : '••••'}
                            </p>
                          </div>
                          <div className="flex items-baseline justify-between gap-2 mt-0.5">
                            {mfSchemeCategory ? (
                              <p className="text-xs text-secondary truncate">
                                {mfSchemeCategory}
                                {mfFundHouse ? ` · ${mfFundHouse}` : ''}
                              </p>
                            ) : (
                              <span />
                            )}
                            <p className="text-xs font-medium flex-shrink-0" style={{ color: gainColor }}>
                              {mode === 'open'
                                ? `${mfGain >= 0 ? '+' : '−'}${formatCurrency(Math.abs(mfGain))} · ${mfGain >= 0 ? '+' : ''}${formatPercent(mfGainPct)}`
                                : '••••'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            <span className="text-[10px] text-tertiary">{totalUnits.toFixed(3)} units</span>
                            {weightedAvg > 0 && (
                              <>
                                <span className="text-[9px] text-tertiary">·</span>
                                <span className="text-[10px] text-tertiary">
                                  Avg NAV{' '}
                                  {mode === 'open'
                                    ? `₹${weightedAvg.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                                    : '••••'}
                                </span>
                              </>
                            )}
                            {liveNav != null && (
                              <>
                                <span className="text-[9px] text-tertiary">·</span>
                                <span className="text-[10px] font-medium" style={{ color: meta.color }}>
                                  NAV{' '}
                                  {mode === 'open'
                                    ? `₹${liveNav.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                                    : '••••'}
                                  <span className="ml-0.5 opacity-60 text-[9px]">live</span>
                                </span>
                              </>
                            )}
                            {isMultiLot && (
                              <span className="ml-auto text-[10px] text-tertiary flex items-center gap-0.5">
                                <i
                                  className={`ti ${isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}`}
                                  style={{ fontSize: 11 }}
                                />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                    {isMultiLot && isExpanded && (
                      <div
                        className="mx-4 mb-3 rounded-xl overflow-hidden"
                        style={{ backgroundColor: 'var(--color-surface-secondary)' }}
                      >
                        {lots.map((lot, idx) => {
                          const lotCurrent = effectiveValue(lot);
                          const lotGain = lotCurrent - lot.investedAmount;
                          const lotGainPct = lot.investedAmount > 0 ? (lotGain / lot.investedAmount) * 100 : 0;
                          const lotGainColor = lotGain >= 0 ? '#10b981' : '#ef4444';
                          return (
                            <button
                              key={lot.id}
                              onClick={() => openEdit(lot)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-theme last:border-0"
                            >
                              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-secondary bg-surface">
                                {idx + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-primary">
                                  {(lot.units ?? 0).toFixed(3)} units
                                  {lot.avgCostPrice != null && (
                                    <span className="text-tertiary">
                                      {' '}
                                      · Avg NAV{' '}
                                      {mode === 'open'
                                        ? `₹${lot.avgCostPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                                        : '••••'}
                                    </span>
                                  )}
                                </p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-xs font-medium text-primary">
                                  {mode === 'open' ? formatCurrency(lotCurrent) : '••••'}
                                </p>
                                <p className="text-[10px]" style={{ color: lotGainColor }}>
                                  {lotGain >= 0 ? '+' : '−'}
                                  {formatPercent(Math.abs(lotGainPct))}
                                </p>
                              </div>
                              <i className="ti ti-pencil text-tertiary flex-shrink-0" style={{ fontSize: 13 }} />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return null;
            });
          })()}
        </div>
      )}

      <button
        onClick={() => setForm({ editing: null })}
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

      {form &&
        (activeClass === 'stock' ? (
          <StockModal editing={form.editing} onSave={save} onDelete={del} onClose={close} />
        ) : (
          <MfModal editing={form.editing} onSave={save} onDelete={del} onClose={close} />
        ))}
    </>
  );
}
