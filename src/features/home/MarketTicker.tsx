import { useEffect, useState } from 'react';
import { Modal, Toggle } from '@/components/ui';
import { STATUS } from '@/lib/statusColors';
import {
  TICKER_CONFIGS,
  fetchMarketTickers,
  loadEnabledTickers,
  saveEnabledTickers,
  type TickerId,
  type TickerResult
} from '@/core/market/marketDataClient';

/** Slim, scrollable market ticker tape at the top of Home — the standard placement users expect. */
export function MarketTicker() {
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
      <div className="surface rounded-xl flex items-center pr-1">
        <div className="flex-1 flex items-center gap-4 overflow-x-auto scrollbar-none px-3 py-2">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-20 h-4 rounded bg-surface-2 animate-pulse" />
              ))
            : tickers.map((t) => {
                const up = t.changePct !== null && t.changePct >= 0;
                const changeColor =
                  t.changePct === null ? 'var(--color-text-tertiary)' : up ? STATUS.success : STATUS.danger;
                return (
                  <div key={t.id} className="flex-shrink-0 flex items-center gap-1.5 text-[12px] whitespace-nowrap">
                    <span className="font-semibold text-secondary">{t.label}</span>
                    <span className="font-semibold text-primary tabular-nums">
                      {t.price !== null ? t.formatValue(t.price) : '—'}
                    </span>
                    {t.changePct !== null && (
                      <span className="font-medium tabular-nums" style={{ color: changeColor }}>
                        {up ? '▲' : '▼'} {Math.abs(t.changePct).toFixed(2)}%
                      </span>
                    )}
                  </div>
                );
              })}
        </div>
        <button
          type="button"
          onClick={() => setManageOpen(true)}
          aria-label="Manage market tickers"
          className="flex-shrink-0 w-7 h-7 grid place-items-center rounded-lg text-tertiary hover:text-primary"
        >
          <i className="ti ti-dots" style={{ fontSize: 16 }} aria-hidden="true" />
        </button>
      </div>

      {manageOpen && (
        <Modal onClose={() => setManageOpen(false)} title="Market tickers">
          <div className="flex flex-col divide-y divide-[var(--color-border)] -mx-4">
            {TICKER_CONFIGS.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary">{c.label}</p>
                  <p className="text-xs text-tertiary">{c.sublabel}</p>
                </div>
                <Toggle value={enabled.has(c.id)} onChange={() => toggleTicker(c.id)} />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-tertiary text-center mt-4">
            Prices refresh every 15 minutes · Indices, metals &amp; forex
          </p>
        </Modal>
      )}
    </>
  );
}
