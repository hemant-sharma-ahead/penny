// Market ticker snapshot — the fixed global set (indices/forex/commodity/metals) that's identical for
// every user. Refreshed by Cron and served as ONE small JSON (edge-cached), so it's never a per-user
// upstream call. See docs/BACKEND_STRATEGY.md §9.5 / Track A step 8.

export interface MarketTicker {
  price: number | null;
  previousClose: number | null;
  currency: string;
}

export interface MarketSnapshot {
  updatedAt: number;
  tickers: Record<string, MarketTicker>;
}

type Source =
  | { id: string; kind: 'yf'; symbol: string; currency: string }
  | { id: string; kind: 'mf'; scheme: string; multiplier: number; currency: string };

// Mirrors the client's TICKER_CONFIGS source mapping (src/core/market/marketDataClient.ts).
const SOURCES: Source[] = [
  { id: 'sensex', kind: 'yf', symbol: '^BSESN', currency: 'INR' },
  { id: 'nifty50', kind: 'yf', symbol: '^NSEI', currency: 'INR' },
  { id: 'usdinr', kind: 'yf', symbol: 'USDINR=X', currency: 'INR' },
  { id: 'crude', kind: 'yf', symbol: 'CL=F', currency: 'USD' },
  { id: 'gold', kind: 'mf', scheme: '140088', multiplier: 100, currency: 'INR' },
  { id: 'silver', kind: 'mf', scheme: '149758', multiplier: 1, currency: 'INR' }
];

export const SNAPSHOT_KEY = 'market:snapshot';
const SNAPSHOT_TTL = 3600; // KV safety TTL; Cron refreshes well within this

interface YfChartResponse {
  chart?: {
    result?: Array<{ meta?: { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number } }>;
  };
}
interface MfApiResponse {
  data?: Array<{ nav?: string }>;
}

async function fetchYf(symbol: string): Promise<{ price: number; previousClose: number | null } | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`,
      { headers: { 'user-agent': 'penny-api-proxy' } }
    );
    if (!res.ok) return null;
    const meta = ((await res.json()) as YfChartResponse).chart?.result?.[0]?.meta;
    if (typeof meta?.regularMarketPrice !== 'number') return null;
    return { price: meta.regularMarketPrice, previousClose: meta.previousClose ?? meta.chartPreviousClose ?? null };
  } catch {
    return null;
  }
}

async function fetchMf(
  scheme: string,
  multiplier: number
): Promise<{ price: number; previousClose: number | null } | null> {
  try {
    const res = await fetch(`https://api.mfapi.in/mf/${scheme}`);
    if (!res.ok) return null;
    const data = ((await res.json()) as MfApiResponse).data;
    const nav0 = data?.[0]?.nav;
    if (!nav0) return null;
    const price = parseFloat(nav0) * multiplier;
    if (isNaN(price)) return null;
    const nav1 = data?.[1]?.nav;
    return { price, previousClose: nav1 ? parseFloat(nav1) * multiplier : null };
  } catch {
    return null;
  }
}

/** Fetch all tickers once (server-side) and store the snapshot in KV. Called by Cron + on cold miss. */
export async function buildMarketSnapshot(env: { CACHE: KVNamespace }): Promise<MarketSnapshot> {
  const tickers: Record<string, MarketTicker> = {};
  await Promise.all(
    SOURCES.map(async (s) => {
      const r = s.kind === 'yf' ? await fetchYf(s.symbol) : await fetchMf(s.scheme, s.multiplier);
      tickers[s.id] = { price: r?.price ?? null, previousClose: r?.previousClose ?? null, currency: s.currency };
    })
  );
  const snapshot: MarketSnapshot = { updatedAt: Date.now(), tickers };
  await env.CACHE.put(SNAPSHOT_KEY, JSON.stringify(snapshot), { expirationTtl: SNAPSHOT_TTL });
  return snapshot;
}

/** Read the snapshot from KV; build it once if missing (cold start before the first Cron run). */
export async function getMarketSnapshot(env: { CACHE: KVNamespace }): Promise<MarketSnapshot> {
  const cached = await env.CACHE.get(SNAPSHOT_KEY);
  return cached ? (JSON.parse(cached) as MarketSnapshot) : buildMarketSnapshot(env);
}
