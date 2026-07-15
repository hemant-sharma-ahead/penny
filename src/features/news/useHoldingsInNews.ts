import { useEffect, useMemo, useState } from 'react';
import { holdingsRepo } from '@/core/db/repositories';
import { tagEntities } from '@/core/sentiment';
import type { NewsItem } from '@/core/news/newsTypes';

/** A headline that mentions one or more stocks the user owns. */
export interface HoldingNewsMatch {
  item: NewsItem;
  /** The owned stocks this headline mentions (display name, e.g. "Reliance Industries"). */
  holdings: { symbol: string; name: string }[];
}

/** Per-symbol match count, most-mentioned first — powers the "Holding" filter dropdown. */
export interface HoldingOption {
  symbol: string;
  name: string;
  count: number;
}

interface Result {
  matches: HoldingNewsMatch[];
  holdingOptions: HoldingOption[];
  /** True once we know the user owns at least one stock holding. */
  hasStocks: boolean;
  loading: boolean;
}

/** NSE tickers may be stored with an exchange suffix; normalize both sides before comparing. */
function normSymbol(s: string): string {
  return s
    .toUpperCase()
    .replace(/\.(NS|BO)$/, '')
    .trim();
}

const MAX_MATCHES = 8;

/**
 * Cross-references the (already-fetched) headlines with the user's stock holdings, on-device.
 * Returns the headlines that mention a stock the user owns — recency-ordered (items arrive sorted),
 * NOT ranked by any signal. Informational only; no recommendation, no forecast.
 * See docs/MARKET_SENTIMENT_RESEARCH.md.
 */
export function useHoldingsInNews(items: NewsItem[]): Result {
  const [owned, setOwned] = useState<Map<string, string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    holdingsRepo
      .getAll()
      .then((holdings) => {
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const h of holdings) {
          if (h.assetClass === 'stock' && h.symbol) map.set(normSymbol(h.symbol), h.name);
        }
        setOwned(map);
      })
      .catch(() => {
        if (!cancelled) setOwned(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const matches = useMemo(() => {
    if (!owned || owned.size === 0) return [];
    const out: HoldingNewsMatch[] = [];
    for (const item of items) {
      const hit = tagEntities(item.title)
        .filter((m) => owned.has(normSymbol(m.symbol)))
        .map((m) => ({ symbol: m.symbol, name: owned.get(normSymbol(m.symbol)) ?? m.name }));
      if (hit.length > 0) out.push({ item, holdings: hit });
      if (out.length >= MAX_MATCHES) break;
    }
    return out;
  }, [items, owned]);

  const holdingOptions = useMemo(() => {
    const bySymbol = new Map<string, HoldingOption>();
    for (const m of matches) {
      for (const h of m.holdings) {
        const prev = bySymbol.get(h.symbol);
        if (prev) prev.count += 1;
        else bySymbol.set(h.symbol, { symbol: h.symbol, name: h.name, count: 1 });
      }
    }
    return [...bySymbol.values()].sort((a, b) => b.count - a.count);
  }, [matches]);

  return { matches, holdingOptions, hasStocks: (owned?.size ?? 0) > 0, loading: owned === null };
}
