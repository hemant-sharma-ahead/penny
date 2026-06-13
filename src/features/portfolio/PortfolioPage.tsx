import { useState, useMemo } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import { holdingsRepo } from '@/core/db/repositories';
import { fetchMfNav, fetchStockPrice } from '@/core/db/priceCache';
import { useRepository } from '@/hooks/useRepository';
import type { AssetClass, Holding } from '@/core/db/types';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { HoldingForm } from './HoldingForm';

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

function effectiveValue(h: Holding): number {
  return h.currentValue ?? h.investedAmount;
}

export function PortfolioPage() {
  const { mode } = usePrivacy();
  const { items: holdings, save: saveHolding, remove: removeHolding } = useRepository(holdingsRepo);

  const [activeTab, setActiveTab] = useState<'holdings' | 'allocation'>('holdings');
  const [showForm, setShowForm] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── Derived ────────────────────────────────────────────────────────────────

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

  // ── Handlers ───────────────────────────────────────────────────────────────

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
            const currentValue = h.units != null ? h.units * nav : undefined;
            return saveHolding({ ...h, currentPrice: nav, currentValue, updatedAt: Date.now() });
          });
        }
        if (h.assetClass === 'stock' && h.symbol) {
          return fetchStockPrice(h.symbol).then((price) => {
            if (price === null) return;
            const currentValue = h.units != null ? h.units * price : undefined;
            return saveHolding({ ...h, currentPrice: price, currentValue, updatedAt: Date.now() });
          });
        }
        return Promise.resolve();
      });

    Promise.all(updates)
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Portfolio</h2>
          {holdings.some((h) => (h.assetClass === 'mf' && h.schemeCode) || (h.assetClass === 'stock' && h.symbol)) && (
            <button
              onClick={handleRefreshPrices}
              disabled={refreshing}
              className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 disabled:opacity-50"
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
        {holdings.length > 0 && (
          <div className="flex items-baseline gap-3 mt-1">
            <p className="text-sm text-slate-500">{mode === 'open' ? formatCurrency(totalCurrent) : '••••'}</p>
            <span className={`text-xs font-medium ${overallReturn >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {overallReturn >= 0 ? '+' : ''}
              {formatPercent(overallReturn)}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 px-4">
        {(['holdings', 'allocation'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`py-2.5 mr-5 text-sm font-medium border-b-2 -mb-px capitalize transition-colors ${
              activeTab === tab ? 'border-[#00a86b] text-[#00a86b]' : 'border-transparent text-slate-500'
            }`}
          >
            {tab === 'allocation' ? 'Allocation' : 'Holdings'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        {/* ── Holdings tab ── */}
        {activeTab === 'holdings' && (
          <div>
            {holdings.length === 0 ? (
              <div className="p-10 text-center">
                <i className="ti ti-chart-bar text-slate-300" style={{ fontSize: 44 }} aria-hidden="true" />
                <p className="text-sm text-slate-400 mt-3">No holdings yet. Tap + to add your first investment.</p>
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
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
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
                          className="w-full flex items-center gap-3 px-4 py-3 border-b border-slate-50 active:bg-slate-50 text-left"
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
                            <p className="text-sm font-medium text-slate-800 truncate">{h.name}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Invested: {mode === 'open' ? formatCurrency(h.investedAmount) : '••••'}
                              {hasLivePrice && (
                                <span className="ml-1.5 text-[10px] font-medium text-[#00a86b]">live</span>
                              )}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-semibold text-slate-800">
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
              <p className="text-sm text-slate-400 text-center mt-8">Add holdings to see your allocation.</p>
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
                    <div key={a.assetClass} className="bg-white rounded-xl border border-slate-100 p-3">
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
                          <span className="text-sm font-medium text-slate-700">{a.meta.label}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-semibold text-slate-800">
                            {mode === 'open' ? formatCurrency(a.value) : '••••'}
                          </span>
                          <span className="text-xs text-slate-400 ml-2">{formatPercent(a.pct, 0)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${a.pct}%`, backgroundColor: a.meta.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary footer */}
                <div className="mt-4 bg-slate-50 rounded-xl p-3 flex justify-between text-xs">
                  <span className="text-slate-500">
                    Total invested:{' '}
                    <span className="font-medium text-slate-700">
                      {mode === 'open' ? formatCurrency(totalInvested) : '••••'}
                    </span>
                  </span>
                  <span className="text-slate-500">
                    Current:{' '}
                    <span className="font-medium text-slate-700">
                      {mode === 'open' ? formatCurrency(totalCurrent) : '••••'}
                    </span>
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* FAB — add holding */}
      <button
        onClick={openAdd}
        className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white z-10"
        style={{ backgroundColor: 'var(--color-primary)' }}
        aria-label="Add holding"
      >
        <i className="ti ti-plus" style={{ fontSize: 24 }} aria-hidden="true" />
      </button>

      {showForm && (
        <HoldingForm
          editing={editingHolding}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
