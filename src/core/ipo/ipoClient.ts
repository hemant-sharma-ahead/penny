import type { IpoCache, IpoCategory, IpoItem, IpoStatus, RawIpoResponse, RawIpoRow } from './ipoTypes';

// Update {year} and {fy} every April when the Indian financial year rolls over.
// Confirmed working with these values as of June 2026 — the year params appear
// to be internal report keys on investorgain, not strict calendar filters.
const IPO_API_YEAR = '2025';
const IPO_API_FY = '2025-26';

const BASE_URL = 'https://webnodejs.investorgain.com/cloud/report/data-read';
const CACHE_KEY = 'penny_ipo_cache';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// IPO subscription hours: 10:00–17:00 IST, Mon–Fri (IST = UTC+5:30)
function isMarketHours(): boolean {
  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const h = nowIST.getUTCHours();
  const day = nowIST.getUTCDay();
  return h >= 10 && h < 17 && day !== 0 && day !== 6;
}

function parseGmpValue(raw: string): number | null {
  const match = raw.match(/<b>([\d.-]+)<\/b>/);
  if (!match || match[1] === '--') return null;
  return parseFloat(match[1]);
}

function parseListingGain(nameHtml: string): { price: number; gain: number } | null {
  const match = nameHtml.match(/L@([\d.]+)\s*\(([-\d.]+)%\)/);
  if (!match) return null;
  return { price: parseFloat(match[1]), gain: parseFloat(match[2]) };
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&#8377;/g, '₹')
    .trim();
}

function deriveStatus(row: RawIpoRow): IpoStatus {
  const h = row['~Highlight_Row'];
  if (h === 'color-lightyellow') return 'upcoming';
  if (h === 'color-green') return 'open';
  if (h === 'color-antiquewhite') return 'closed';
  return 'listed';
}

function deriveCategory(raw: string): IpoCategory {
  return raw === 'IPO' ? 'mainboard' : 'sme';
}

function parseRow(row: RawIpoRow): IpoItem {
  const listing = parseListingGain(row.Name);
  const rawPrice = row['Price (₹)'];
  const rawLot = row['Lot'];
  const rawSize = row['IPO Size'];

  return {
    id: row['~id'],
    name: row['~ipo_name'],
    category: deriveCategory(row['~IPO_Category']),
    status: deriveStatus(row),
    price: rawPrice ? parseFloat(rawPrice) || null : null,
    lotSize: rawLot ? parseInt(rawLot, 10) || null : null,
    issueSize: rawSize && rawSize !== '-' ? stripHtml(rawSize) : null,
    openDate: row['~Srt_Open'] || null,
    closeDate: row['~Srt_Close'] || null,
    boaDate: row['~Srt_BoA_Dt'] || null,
    listingDate: row['~Str_Listing'] || null,
    gmpValue: parseGmpValue(row.GMP),
    gmpPercent: parseFloat(row['~gmp_percent_calc']),
    subscription: row['Sub'] && row['Sub'] !== '-' ? row['Sub'] : null,
    listingGain: listing?.gain ?? null,
    listingPrice: listing?.price ?? null,
    detailPath: row['~urlrewrite_folder_name'],
    updatedAt: stripHtml(row['Updated-On'])
  };
}

function loadCache(): IpoCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as IpoCache) : null;
  } catch {
    return null;
  }
}

function saveCache(cache: IpoCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage full — non-fatal
  }
}

export function getCachedIpos(): IpoCache | null {
  return loadCache();
}

export async function fetchIpos(forceRefresh = false): Promise<IpoItem[]> {
  const cached = loadCache();
  const age = cached ? Date.now() - cached.fetchedAt : Infinity;
  const stale = age > CACHE_TTL_MS;
  const shouldRefresh = forceRefresh || !cached || (isMarketHours() && stale);

  if (!shouldRefresh && cached) return cached.data;

  try {
    const url = `${BASE_URL}/331/1/6/${IPO_API_YEAR}/${IPO_API_FY}/0/all?search=&v=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as RawIpoResponse;
    const data = json.reportTableData.map(parseRow);
    saveCache({ data, fetchedAt: Date.now() });
    return data;
  } catch {
    return cached?.data ?? [];
  }
}
