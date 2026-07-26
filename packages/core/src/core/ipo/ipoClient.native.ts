import type {
  IpoCache,
  IpoCategory,
  IpoItem,
  IpoStatus,
  IpoSubDetail,
  IpoSubRow,
  RawHistoricalIpoRow,
  RawIpoResponse,
  RawIpoRow
} from './ipoTypes';
import { IG_BASE } from '@/core/net/apiBase';
import {
  IPO_API_YEAR,
  IPO_API_FY,
  IPO_BASE_PATH,
  IPO_SUBSCRIPTION_PATH,
  IPO_CACHE_TTL_MS
} from './ipoClient.constants';

const BASE_URL = `${IG_BASE}/${IPO_BASE_PATH}`;
const CACHE_TTL_MS = IPO_CACHE_TTL_MS;

// IPO subscription hours: 10:00–17:00 IST, Mon–Fri (IST = UTC+5:30)
function isMarketHours(): boolean {
  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const h = nowIST.getUTCHours();
  const day = nowIST.getUTCDay();
  return h >= 10 && h < 17 && day !== 0 && day !== 6;
}

/**
 * RN port of core/ipo/ipoClient.ts. Web's `loadCache`/`saveCache`/the historical-IPO cache use
 * synchronous `localStorage`, which doesn't exist on RN and can't be swapped for `AsyncStorage`
 * mechanically (it's synchronous, feeding otherwise-async fetch functions). Per explicit user decision,
 * mobile drops the persistent, cross-*session* cache entirely — every cold app start re-fetches from
 * network. Within a session, though, an in-memory cache (same idea as `npsClient.native.ts`'s
 * `schemesMemCache`) still avoids refetching on every re-render/navigation, and gives `forceRefresh` and
 * `getCachedIpos` the same real meaning they have on web. The in-memory `subCache` (session-scoped, was
 * already not using localStorage on web) is unchanged.
 */
let ipoMemCache: IpoCache | null = null;

function parseGmpValue(raw: string): number | null {
  const match = raw.match(/<b>([\d.-]+)<\/b>/);
  if (!match || match[1] === '--') return null;
  return parseFloat(match[1] ?? '');
}

function parseListingGain(nameHtml: string): { price: number; gain: number } | null {
  const match = nameHtml.match(/L@([\d.]+)\s*\(([-\d.]+)%\)/);
  if (!match) return null;
  return { price: parseFloat(match[1] ?? ''), gain: parseFloat(match[2] ?? '') };
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

export function getCachedIpos(): IpoCache | null {
  return ipoMemCache;
}

function fmtSub(val: string | number): string {
  const n = parseFloat(String(val));
  if (!n || n <= 0) return '—';
  return `${n.toFixed(2)}x`;
}

// In-memory cache — subscription data is session-scoped, no persistent storage needed on either platform.
const subCache = new Map<number, IpoSubDetail>();

interface RawSubRow {
  Seq: number;
  bid_date: string;
  qib: string;
  nii: string;
  nii_big: string;
  nii_small: string;
  rii: string;
  emp: string;
  total: string;
  [key: string]: unknown;
}

export async function fetchIpoSubscription(id: number): Promise<IpoSubDetail | null> {
  const cached = subCache.get(id);
  if (cached) return cached;
  try {
    const res = await fetch(`${IG_BASE}/${IPO_SUBSCRIPTION_PATH}/${id}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { ipoBiddingData?: RawSubRow[] } };
    const raw = json.data?.ipoBiddingData;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const detail: IpoSubDetail = {
      rows: raw.map((r): IpoSubRow => ({
        seq: Number(r.Seq),
        bidDate: r.bid_date.split(' ').slice(0, 3).join(' '),
        qib: fmtSub(r.qib),
        nii: fmtSub(r.nii),
        niiBig: fmtSub(r.nii_big),
        niiSmall: fmtSub(r.nii_small),
        rii: fmtSub(r.rii),
        emp: fmtSub(r.emp),
        total: fmtSub(r.total)
      })),
      fetchedAt: Date.now()
    };
    subCache.set(id, detail);
    return detail;
  } catch {
    return null;
  }
}

function parseHistDate(s: string): string | null {
  if (!s) return null;
  const months: Record<string, number> = {
    Jan: 1,
    Feb: 2,
    Mar: 3,
    Apr: 4,
    May: 5,
    Jun: 6,
    Jul: 7,
    Aug: 8,
    Sep: 9,
    Oct: 10,
    Nov: 11,
    Dec: 12
  };
  const [day, mon, year] = s.split('-');
  if (!day || !mon || !year) return null;
  const m = months[mon];
  if (!m) return null;
  return `${year}-${String(m).padStart(2, '0')}-${String(parseInt(day, 10)).padStart(2, '0')}`;
}

function parseHistoricalRow(row: RawHistoricalIpoRow): IpoItem {
  const lpMatch = row['Listing Price'].match(/([\d.]+)\s*\(([-\d.]+)%\)/);
  const listingPrice = lpMatch ? parseFloat(lpMatch[1] ?? '') || null : null;
  const listingGain = lpMatch ? parseFloat(lpMatch[2] ?? '') : null;

  const priceStr = row['IPO Price'].replace(/&#?\w+;/g, '').trim();
  const price = parseFloat(priceStr) || null;

  return {
    id: row['~id'],
    name: row.IPO,
    category: row['~IPO_Category'] === 'IPO' ? 'mainboard' : 'sme',
    status: 'listed',
    price,
    lotSize: null,
    issueSize: row.IPO_Size ? `₹${row.IPO_Size} Cr` : null,
    openDate: null,
    closeDate: null,
    boaDate: null,
    listingDate: parseHistDate(row['Listing Date']),
    gmpValue: null,
    gmpPercent: 0,
    subscription: row.Subscription || null,
    listingGain: listingGain !== null && !isNaN(listingGain) ? listingGain : null,
    listingPrice,
    detailPath: row['~URLRewrite_Folder_Name'] ?? '',
    updatedAt: row['Last Updated'] ?? ''
  };
}

export async function fetchHistoricalListedIpos(fyStartYear: number): Promise<IpoItem[]> {
  const fy = `${fyStartYear}-${String(fyStartYear + 1).slice(2)}`;
  const url = `${BASE_URL}/486/1/6/${fyStartYear}/${fy}/0/all?search=&v=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { reportTableData?: RawHistoricalIpoRow[] };
  return (json.reportTableData ?? []).map(parseHistoricalRow);
}

export async function fetchIpos(forceRefresh = false): Promise<IpoItem[]> {
  const age = ipoMemCache ? Date.now() - ipoMemCache.fetchedAt : Infinity;
  const stale = age > CACHE_TTL_MS;
  const shouldRefresh = forceRefresh || !ipoMemCache || (isMarketHours() && stale);

  if (!shouldRefresh && ipoMemCache) return ipoMemCache.data;

  try {
    const url = `${BASE_URL}/331/1/6/${IPO_API_YEAR}/${IPO_API_FY}/0/all?search=&v=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as RawIpoResponse;
    const data = json.reportTableData.map(parseRow);
    ipoMemCache = { data, fetchedAt: Date.now() };
    return data;
  } catch {
    return ipoMemCache?.data ?? [];
  }
}
