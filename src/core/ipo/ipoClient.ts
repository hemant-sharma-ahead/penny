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

// Update every April when the Indian financial year rolls over (FY starts April 1).
const IPO_API_YEAR = '2026';
const IPO_API_FY = '2026-27';

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

function fmtSub(val: string | number): string {
  const n = parseFloat(String(val));
  if (!n || n <= 0) return '—';
  return `${n.toFixed(2)}x`;
}

// In-memory cache — subscription data is session-scoped, no need for localStorage
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
    const res = await fetch(`https://webnodejs.investorgain.com/cloud/ipo/ipo-subscription-read/${id}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { ipoBiddingData?: RawSubRow[] } };
    const raw = json.data?.ipoBiddingData;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const detail: IpoSubDetail = {
      rows: raw.map(
        (r): IpoSubRow => ({
          seq: Number(r.Seq),
          bidDate: r.bid_date.split(' ').slice(0, 3).join(' '),
          qib: fmtSub(r.qib),
          nii: fmtSub(r.nii),
          niiBig: fmtSub(r.nii_big),
          niiSmall: fmtSub(r.nii_small),
          rii: fmtSub(r.rii),
          emp: fmtSub(r.emp),
          total: fmtSub(r.total)
        })
      ),
      fetchedAt: Date.now()
    };
    subCache.set(id, detail);
    return detail;
  } catch {
    return null;
  }
}

const HIST_CACHE_PREFIX = 'penny_ipo_hist_';
const HIST_CACHE_TTL_CURRENT = 60 * 60 * 1000; // 1 h for current FY
const HIST_CACHE_TTL_PAST = 24 * 60 * 60 * 1000; // 24 h for past FYs

function currentFyStartYear(): number {
  const now = new Date();
  const m = now.getMonth() + 1;
  return m >= 4 ? now.getFullYear() : now.getFullYear() - 1;
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
  const cacheKey = `${HIST_CACHE_PREFIX}${fyStartYear}`;
  const isCurrent = fyStartYear === currentFyStartYear();
  const ttl = isCurrent ? HIST_CACHE_TTL_CURRENT : HIST_CACHE_TTL_PAST;

  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const { data, ts } = JSON.parse(raw) as { data: IpoItem[]; ts: number };
      if (Date.now() - ts < ttl) return data;
    }
  } catch {
    /* ignore */
  }

  const url = `${BASE_URL}/486/1/6/${fyStartYear}/${fy}/0/all?search=&v=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { reportTableData?: RawHistoricalIpoRow[] };
  const items = (json.reportTableData ?? []).map(parseHistoricalRow);

  try {
    localStorage.setItem(cacheKey, JSON.stringify({ data: items, ts: Date.now() }));
  } catch {
    /* localStorage full — non-fatal */
  }

  return items;
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
