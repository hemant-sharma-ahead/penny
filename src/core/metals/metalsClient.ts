// MFAPI.in scheme codes for Indian precious metal ETFs (CORS-friendly, no API key)
// Gold BeES (Nippon):  1 unit = 0.01g of 99.5% gold  →  ₹/gram = NAV × 100
// Silver ETF (Nippon): 1 unit ≈ 1g silver             →  ₹/gram = NAV
// Data updates once daily after market close — acceptable for net-worth tracking.

import { db } from '@/core/db/schema';

const GOLD_SCHEME = '140088';
const SILVER_SCHEME = '149758';
const METAL_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface MfApiLatestResponse {
  status: string;
  data: Array<{ date: string; nav: string }>;
}

async function fetchNav(schemeCode: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}/latest`);
    if (!res.ok) return null;
    const json = (await res.json()) as MfApiLatestResponse;
    if (json.status !== 'SUCCESS' || !json.data?.[0]?.nav) return null;
    return parseFloat(json.data[0].nav) || null;
  } catch {
    return null;
  }
}

async function getCachedPrice(key: string): Promise<number | null> {
  const entry = await db.price_cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > METAL_TTL_MS) return null;
  return entry.price;
}

async function setCachedPrice(key: string, price: number): Promise<void> {
  await db.price_cache.put({ id: key, symbol: key, price, currency: 'INR', fetchedAt: Date.now() });
}

export async function fetchGoldPricePerGram(): Promise<number | null> {
  const cached = await getCachedPrice('metal:gold');
  if (cached != null) return cached;
  const nav = await fetchNav(GOLD_SCHEME);
  if (!nav) return null;
  const pricePerGram = nav * 100;
  await setCachedPrice('metal:gold', pricePerGram);
  return pricePerGram;
}

export async function fetchSilverPricePerGram(): Promise<number | null> {
  const cached = await getCachedPrice('metal:silver');
  if (cached != null) return cached;
  const nav = await fetchNav(SILVER_SCHEME);
  if (!nav) return null;
  await setCachedPrice('metal:silver', nav);
  return nav;
}

export async function fetchMetalPrices(): Promise<{ gold: number | null; silver: number | null }> {
  const [gold, silver] = await Promise.all([fetchGoldPricePerGram(), fetchSilverPricePerGram()]);
  return { gold, silver };
}

// Derive karat-adjusted price from 24K spot price
export function goldPriceForKarat(spotPer24KGram: number, karat: 14 | 18 | 22 | 24): number {
  return spotPer24KGram * (karat / 24);
}
