import { useEffect, useState } from 'react';
import {
  TICKER_CONFIGS,
  fetchMarketTickers,
  loadEnabledTickers,
  saveEnabledTickers,
  type TickerId,
  type TickerResult
} from '@/core/market/marketDataClient';

export function MarketStrip() {
  const [enabled, setEnabled] = useState<Set<TickerId>>(loadEnabledTickers);
  const [tickers, setTickers] = useState<TickerResult[]>([]);
  const [loading, setLoading] = useState(() => loadEnabledTickers().size > 0);
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => {
    const mountIds = TICKER_CONFIGS.filter((c) => loadEnabledTickers().has(c.id)).map((c) => c.id);
    if (mountIds.length === 0) return;
    fetchMarketTickers(mountIds)
      .then(setTickers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleTicker(id: TickerId) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveEnabledTickers(TICKER_CONFIGS.filter((c) => next.has(c.id)).map((c) => c.id));
      return next;
    });
  }

  if (!loading && tickers.length === 0 && enabled.size === 0) return null;

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-tertiary">Markets</p>
          <button
            onClick={() => setManageOpen(true)}
            className="text-xs font-medium"
            style={{ color: 'var(--color-primary)' }}
          >
            Manage →
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-4 px-4 scrollbar-none">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-[90px] h-[72px] rounded-xl bg-surface-2 animate-pulse" />
              ))
            : tickers.map((t) => {
                const up = t.changePct !== null && t.changePct >= 0;
                const changeColor = t.changePct === null ? 'var(--color-text-tertiary)' : up ? '#16a34a' : '#dc2626';
                return (
                  <div
                    key={t.id}
                    className="flex-shrink-0 surface rounded-xl px-3 py-2.5 flex flex-col gap-0.5 min-w-[90px]"
                  >
                    <p className="text-[10px] font-medium text-tertiary truncate">{t.label}</p>
                    <p className="text-[13px] font-semibold text-primary leading-tight">
                      {t.price !== null ? t.formatValue(t.price) : '—'}
                    </p>
                    <div className="flex items-center gap-0.5">
                      {t.changePct !== null && (
                        <i
                          className={`ti ${up ? 'ti-trending-up' : 'ti-trending-down'}`}
                          style={{ fontSize: 11, color: changeColor }}
                          aria-hidden="true"
                        />
                      )}
                      <p className="text-[10px] font-medium" style={{ color: changeColor }}>
                        {t.changePct !== null ? `${up ? '+' : ''}${t.changePct.toFixed(2)}%` : '—'}
                      </p>
                    </div>
                  </div>
                );
              })}
        </div>
      </div>

      {/* Manage sheet */}
      {manageOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center px-4"
          style={{ paddingTop: 56, paddingBottom: 72 }}
        >
          <div className="absolute inset-0 bg-black/30" onClick={() => setManageOpen(false)} />
          <div className="relative w-full max-w-[430px] bg-surface rounded-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-4 border-b border-theme">
              <p className="text-base font-semibold text-primary">Market tickers</p>
              <button
                onClick={() => setManageOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:bg-surface-2"
              >
                <i className="ti ti-x" style={{ fontSize: 18 }} aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-col divide-y divide-theme overflow-y-auto">
              {TICKER_CONFIGS.map((c) => {
                const on = enabled.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleTicker(c.id)}
                    className="flex items-center gap-3 px-4 py-3.5 text-left w-full active:bg-surface-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary">{c.label}</p>
                      <p className="text-xs text-tertiary">{c.sublabel}</p>
                    </div>
                    <div
                      className="w-10 h-6 rounded-full flex items-center transition-colors flex-shrink-0"
                      style={{
                        backgroundColor: on ? 'var(--color-primary)' : 'var(--color-border)',
                        padding: '2px'
                      }}
                    >
                      <div
                        className="w-5 h-5 rounded-full bg-white transition-transform"
                        style={{ transform: on ? 'translateX(16px)' : 'translateX(0)' }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="px-4 py-4 border-t border-theme">
              <p className="text-[11px] text-tertiary text-center">
                Prices refresh every 15 minutes · Indices, metals &amp; forex
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
