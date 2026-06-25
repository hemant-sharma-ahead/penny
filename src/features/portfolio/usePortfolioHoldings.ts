import { useCallback, useMemo, useState } from 'react';
import { holdingsRepo } from '@/core/db/repositories';
import { fetchMfNav, fetchStockPrice } from '@/core/db/priceCache';
import type { AssetClass, Holding } from '@/core/db/types';
import { useLoggedRepository } from '@/hooks/useLoggedRepository';

const summarizeHolding = (h: Holding) => `holding: ${h.name}`;

// ─── Sub-tab config (exported so the page can render the tab strip) ───────────

export type HoldingsSubTab = 'stocks' | 'mf' | 'fixed_income' | 'precious_metals' | 'retirement' | 'real_assets';

export interface HoldingsSubTabConfig {
  key: HoldingsSubTab;
  label: string;
  assetClasses: AssetClass[];
  icon: string;
  emptyMessage: string;
}

export const HOLDINGS_SUBTABS: HoldingsSubTabConfig[] = [
  {
    key: 'stocks',
    label: 'Stocks',
    assetClasses: ['stock'],
    icon: 'ti-trending-up',
    emptyMessage: 'No stocks yet. Tap + to track your equity holdings.'
  },
  {
    key: 'mf',
    label: 'Mutual Funds',
    assetClasses: ['mf'],
    icon: 'ti-chart-donut',
    emptyMessage: 'No mutual funds yet. Tap + to add your MF holdings.'
  },
  {
    key: 'fixed_income',
    label: 'Fixed Income',
    assetClasses: ['fd'],
    icon: 'ti-building-bank',
    emptyMessage: 'No FDs or RDs yet. Tap + to track your fixed deposits.'
  },
  {
    key: 'precious_metals',
    label: 'Metals',
    assetClasses: ['gold'],
    icon: 'ti-coin',
    emptyMessage: 'No gold holdings yet. Tap + to track your precious metals.'
  },
  {
    key: 'retirement',
    label: 'Retirement',
    assetClasses: ['nps', 'ppf', 'epf'],
    icon: 'ti-shield-check',
    emptyMessage: 'No retirement accounts yet. Tap + to add NPS, PPF, or EPF.'
  },
  {
    key: 'real_assets',
    label: 'Real Assets',
    assetClasses: ['vehicle', 'property', 'other'],
    icon: 'ti-home',
    emptyMessage: 'No real assets yet. Tap + to add vehicles or property.'
  }
];

// ─── Utility exported for page-level rendering ────────────────────────────────

export function effectiveValue(h: Holding): number {
  return h.currentValue ?? h.investedAmount;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePortfolioHoldings() {
  const {
    items: holdings,
    save: saveHolding,
    remove: removeHolding
  } = useLoggedRepository(holdingsRepo, {
    entityType: 'holding',
    summarize: summarizeHolding,
    diffFields: ['investedAmount', 'units', 'currentValue']
  });
  const [refreshing, setRefreshing] = useState(false);

  const totalInvested = useMemo(() => holdings.reduce((s, h) => s + h.investedAmount, 0), [holdings]);
  const totalCurrent = useMemo(() => holdings.reduce((s, h) => s + effectiveValue(h), 0), [holdings]);

  const subTabCounts = useMemo(() => {
    const counts: Partial<Record<HoldingsSubTab, number>> = {};
    for (const tab of HOLDINGS_SUBTABS) {
      counts[tab.key] = holdings.filter((h) => tab.assetClasses.includes(h.assetClass)).length;
    }
    return counts;
  }, [holdings]);

  const hasLivePriceRefresh = useMemo(
    () => holdings.some((h) => (h.assetClass === 'mf' && h.schemeCode) || (h.assetClass === 'stock' && h.symbol)),
    [holdings]
  );

  const refreshPrices = useCallback(() => {
    setRefreshing(true);
    const updates = holdings
      .filter((h) => (h.assetClass === 'mf' && h.schemeCode) || (h.assetClass === 'stock' && h.symbol))
      .map((h): Promise<void> => {
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
  }, [holdings, saveHolding]);

  return {
    holdings,
    saveHolding,
    removeHolding,
    totalInvested,
    totalCurrent,
    subTabCounts,
    hasLivePriceRefresh,
    refreshing,
    refreshPrices
  };
}
