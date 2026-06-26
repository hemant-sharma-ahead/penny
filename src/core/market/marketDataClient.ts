import { db } from '@/core/db/schema';
import { YF_BASE } from '@/core/db/priceCache';
import type { PriceCache } from '@/core/db/types';

const MARKET_TTL_MS = 15 * 60 * 1000; // 15 minutes

export type TickerId = 'sensex' | 'nifty50' | 'gold' | 'silver' | 'usdinr' | 'crude';

export interface TickerConfig {
  id: TickerId;
  label: string;
  sublabel: string;
  currency: string;
  formatValue: (v: number) => string;
}

export interface TickerResult extends TickerConfig {
  price: number | null;
  previousClose: number | null;
  changePct: number | null;
}

export const TICKER_CONFIGS: TickerConfig[] = [
  {
    id: 'sensex',
    label: 'Sensex',
    sublabel: 'BSE',
    currency: 'INR',
    formatValue: (v) => (v >= 1_000 ? `${(v / 1_000).toFixed(2)}K` : v.toFixed(0))
  },
  {
    id: 'nifty50',
    label: 'Nifty 50',
    sublabel: 'NSE',
    currency: 'INR',
    formatValue: (v) => (v >= 1_000 ? `${(v / 1_000).toFixed(2)}K` : v.toFixed(0))
  },
  {
    id: 'gold',
    label: 'Gold',
    sublabel: '24K/g',
    currency: 'INR',
    formatValue: (v) => `₹${v.toFixed(0)}`
  },
  {
    id: 'silver',
    label: 'Silver',
    sublabel: '/g',
    currency: 'INR',
    formatValue: (v) => `₹${v.toFixed(1)}`
  },
  {
    id: 'usdinr',
    label: 'USD/INR',
    sublabel: 'Forex',
    currency: 'INR',
    formatValue: (v) => v.toFixed(2)
  },
  {
    id: 'crude',
    label: 'WTI Crude',
    sublabel: '$/bbl',
    currency: 'USD',
    formatValue: (v) => `$${v.toFixed(1)}`
  }
];

const LS_KEY = 'penny_market_tickers_enabled';

export function loadEnabledTickers(): Set<TickerId> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return new Set(TICKER_CONFIGS.map((t) => t.id));
    const arr = JSON.parse(raw) as TickerId[];
    return new Set(arr);
  } catch {
    return new Set(TICKER_CONFIGS.map((t) => t.id));
  }
}

export function saveEnabledTickers(ids: TickerId[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(ids));
}

function isFresh(entry: PriceCache): boolean {
  return Date.now() - entry.fetchedAt < MARKET_TTL_MS;
}

interface YfMeta {
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
  currency?: string;
}

interface YfChartResponse {
  chart?: { result?: Array<{ meta?: YfMeta }> };
}

interface MfApiResponse {
  status: string;
  data: Array<{ date: string; nav: string }>;
}

async function fetchYf(symbol: string, cacheKey: string, currency: string): Promise<PriceCache | null> {
  const cached = await db.price_cache.get(cacheKey);
  if (cached && isFresh(cached)) return cached;

  try {
    const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as YfChartResponse;
    const meta = json.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== 'number') return null;
    const previousClose = meta?.previousClose ?? meta?.chartPreviousClose ?? null;
    const entry: PriceCache = {
      id: cacheKey,
      symbol,
      price,
      previousClose: previousClose ?? undefined,
      currency,
      fetchedAt: Date.now()
    };
    await db.price_cache.put(entry);
    return entry;
  } catch {
    return null;
  }
}

async function fetchMfTicker(schemeCode: string, cacheKey: string, multiplier = 1): Promise<PriceCache | null> {
  const cached = await db.price_cache.get(cacheKey);
  if (cached && isFresh(cached)) return cached;

  try {
    const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`);
    if (!res.ok) return null;
    const json = (await res.json()) as MfApiResponse;
    const navStr0 = json.data[0]?.nav;
    const navStr1 = json.data[1]?.nav;
    if (!navStr0) return null;
    const price = parseFloat(navStr0) * multiplier;
    const previousClose = navStr1 ? parseFloat(navStr1) * multiplier : undefined;
    if (isNaN(price)) return null;
    const entry: PriceCache = {
      id: cacheKey,
      symbol: schemeCode,
      price,
      previousClose,
      currency: 'INR',
      fetchedAt: Date.now()
    };
    await db.price_cache.put(entry);
    return entry;
  } catch {
    return null;
  }
}

async function fetchTicker(id: TickerId): Promise<{ price: number | null; previousClose: number | null }> {
  let entry: PriceCache | null = null;

  if (id === 'sensex') entry = await fetchYf('^BSESN', 'market:sensex', 'INR');
  else if (id === 'nifty50') entry = await fetchYf('^NSEI', 'market:nifty50', 'INR');
  else if (id === 'usdinr') entry = await fetchYf('USDINR=X', 'market:usdinr', 'INR');
  else if (id === 'crude') entry = await fetchYf('CL=F', 'market:crude', 'USD');
  else if (id === 'gold') entry = await fetchMfTicker('140088', 'market:gold', 100);
  else if (id === 'silver') entry = await fetchMfTicker('149758', 'market:silver', 1);

  return {
    price: entry?.price ?? null,
    previousClose: entry?.previousClose ?? null
  };
}

export async function fetchMarketTickers(ids: TickerId[]): Promise<TickerResult[]> {
  const results = await Promise.all(ids.map((id) => fetchTicker(id)));
  return ids.flatMap((id, i) => {
    const config = TICKER_CONFIGS.find((c) => c.id === id);
    const result = results[i];
    if (!config || !result) return [];
    const { price, previousClose } = result;
    const changePct =
      price !== null && previousClose !== null && previousClose !== 0
        ? ((price - previousClose) / previousClose) * 100
        : null;
    return [{ ...config, price, previousClose, changePct }];
  });
}
