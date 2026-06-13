import { db } from './schema';
import type { PriceCache } from './types';

const PRICE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function isPriceFresh(entry: PriceCache): boolean {
  return Date.now() - entry.fetchedAt < PRICE_TTL_MS;
}

async function getCached(id: string): Promise<PriceCache | undefined> {
  return db.price_cache.get(id);
}

async function setCache(entry: PriceCache): Promise<void> {
  await db.price_cache.put(entry);
}

interface MfApiResponse {
  status: string;
  data: Array<{ date: string; nav: string }>;
}

interface YfChartResponse {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number };
    }>;
  };
}

export async function fetchMfNav(schemeCode: string): Promise<number | null> {
  const cacheKey = `mf:${schemeCode}`;
  const cached = await getCached(cacheKey);
  if (cached && isPriceFresh(cached)) return cached.price;

  try {
    const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`);
    if (!res.ok) return null;
    const json = (await res.json()) as MfApiResponse;
    const navStr = json.data.at(0)?.nav;
    if (!navStr) return null;
    const nav = parseFloat(navStr);
    if (isNaN(nav)) return null;
    await setCache({
      id: cacheKey,
      symbol: schemeCode,
      price: nav,
      nav,
      currency: 'INR',
      fetchedAt: Date.now()
    });
    return nav;
  } catch {
    return null;
  }
}

export async function fetchStockPrice(symbol: string): Promise<number | null> {
  const cacheKey = `stock:${symbol}`;
  const cached = await getCached(cacheKey);
  if (cached && isPriceFresh(cached)) return cached.price;

  try {
    const url = `https://query.yahoofinance.com/v8/finance/chart/${symbol}.NS?interval=1d&range=1d`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as YfChartResponse;
    const price = json.chart?.result?.at(0)?.meta?.regularMarketPrice;
    if (typeof price !== 'number') return null;
    await setCache({ id: cacheKey, symbol, price, currency: 'INR', fetchedAt: Date.now() });
    return price;
  } catch {
    return null;
  }
}
