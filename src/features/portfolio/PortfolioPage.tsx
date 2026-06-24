import { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { usePrivacy } from '@/context/PrivacyContext';
import { usePortfolioHoldings, HOLDINGS_SUBTABS } from './usePortfolioHoldings';
import type { HoldingsSubTab, HoldingsSubTabConfig } from './usePortfolioHoldings';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { EquitySection } from './holdings/equity/EquitySection';
import { FixedIncomeSection } from './holdings/fixed-income/FixedIncomeSection';
import { PreciousMetalsSection } from './holdings/precious-metals/PreciousMetalsSection';
import { RealAssetsSection } from './holdings/real-assets/RealAssetsSection';
import { RetirementSection } from './holdings/retirement/RetirementSection';
import { IpoTab } from './ipo/IpoTab';

// ─── PortfolioPage ────────────────────────────────────────────────────────────

export function PortfolioPage() {
  const { mode } = usePrivacy();
  const location = useLocation();
  const {
    holdings,
    saveHolding,
    removeHolding,
    totalInvested,
    totalCurrent,
    subTabCounts,
    hasLivePriceRefresh,
    refreshing,
    refreshPrices
  } = usePortfolioHoldings();

  const locationState = location.state as { holdingsSubTab?: HoldingsSubTab } | null;
  const [activeTab, setActiveTab] = useState<'holdings' | 'ipo'>('holdings');
  const [holdingsSubTab, setHoldingsSubTab] = useState<HoldingsSubTab>(locationState?.holdingsSubTab ?? 'stocks');

  const overallReturn = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;

  // Holdings filtered per sub-tab (depends on holdingsSubTab UI state — stays in page)
  const activeSubTabConfig = (HOLDINGS_SUBTABS.find((t) => t.key === holdingsSubTab) ??
    HOLDINGS_SUBTABS[0]) as HoldingsSubTabConfig;
  const subTabHoldings = useMemo(
    () => holdings.filter((h) => activeSubTabConfig.assetClasses.includes(h.assetClass)),
    [holdings, activeSubTabConfig]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-theme">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-primary">Portfolio</h2>
          {activeTab !== 'ipo' && hasLivePriceRefresh && (
            <button
              onClick={refreshPrices}
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
        {(['holdings', 'ipo'] as const).map((tab) => (
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
            {tab === 'ipo' ? 'IPO' : 'Holdings'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        {/* ── Holdings tab ── */}
        {activeTab === 'holdings' && (
          <div className="flex flex-col h-full">
            {/* Holdings sub-tab bar — 2 rows: 4 on top, 2 on bottom */}
            <div className="flex flex-col gap-1.5 px-4 pt-2.5 pb-2 border-b border-theme">
              {[HOLDINGS_SUBTABS.slice(0, 3), HOLDINGS_SUBTABS.slice(3)].map((row, rowIdx) => (
                <div key={rowIdx} className="flex gap-1.5">
                  {row.map((tab) => {
                    const count = subTabCounts[tab.key] ?? 0;
                    const isActive = holdingsSubTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setHoldingsSubTab(tab.key)}
                        className="flex items-center justify-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex-1"
                        style={
                          isActive
                            ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                            : {
                                backgroundColor: 'var(--color-surface-secondary)',
                                color: 'var(--color-text-secondary)'
                              }
                        }
                      >
                        {tab.label}
                        {count > 0 && (
                          <span
                            className="text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none"
                            style={
                              isActive
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
              ))}
            </div>

            {/* Sub-tab content */}
            {holdingsSubTab === 'retirement' ? (
              <RetirementSection holdings={subTabHoldings} mode={mode} onSave={saveHolding} onRemove={removeHolding} />
            ) : holdingsSubTab === 'precious_metals' ? (
              <PreciousMetalsSection
                holdings={subTabHoldings}
                mode={mode}
                onSave={saveHolding}
                onRemove={removeHolding}
              />
            ) : holdingsSubTab === 'fixed_income' ? (
              <FixedIncomeSection holdings={subTabHoldings} mode={mode} onSave={saveHolding} onRemove={removeHolding} />
            ) : holdingsSubTab === 'real_assets' ? (
              <RealAssetsSection holdings={subTabHoldings} mode={mode} onSave={saveHolding} onRemove={removeHolding} />
            ) : (
              <EquitySection
                holdings={subTabHoldings}
                assetClass={holdingsSubTab === 'mf' ? 'mf' : 'stock'}
                mode={mode}
                onSave={saveHolding}
                onRemove={removeHolding}
              />
            )}
          </div>
        )}

        {/* ── IPO tab ── */}
        {activeTab === 'ipo' && <IpoTab />}
      </div>
    </div>
  );
}
