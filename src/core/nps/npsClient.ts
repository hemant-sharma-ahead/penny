import type { NpsNavDetail, NpsPfmKey, NpsSchemeEntry, NpsSchemeType } from './npsTypes';
import { NPS_FUND_MANAGERS } from './npsTypes';

const BASE_URL = 'https://npsnav.in/api';
const SCHEMES_CACHE_KEY = 'penny_nps_schemes';
const SCHEMES_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week — scheme list rarely changes

let schemesMemCache: NpsSchemeEntry[] | null = null;
const navMemCache = new Map<string, NpsNavDetail>();

interface RawScheme {
  code?: string;
  scheme_code?: string;
  pfm?: string;
  pfm_name?: string;
  name?: string;
  scheme_name?: string;
  [key: string]: unknown;
}

interface RawNavDetail {
  nav?: string | number;
  latestNav?: string | number;
  date?: string;
  latestNavDate?: string;
  nav_date?: string;
  returns?: Record<string, string | number | null | undefined>;
  [key: string]: unknown;
}

const SCHEME_TYPE_RE = /[Ss]cheme[\s-]+(E|C|G|A)\b/;
const TIER_RE = /[Tt]ier[\s-]+(I{1,2})\b/;

const PFM_MATCHERS: { key: NpsPfmKey; re: RegExp }[] = [
  { key: 'sbi', re: /\bSBI\b/i },
  { key: 'lic', re: /\bLIC\b/i },
  { key: 'uti', re: /\bUTI\b/i },
  { key: 'hdfc', re: /\bHDFC\b/i },
  { key: 'icici', re: /\bICICI\b/i },
  { key: 'kotak', re: /\bKotak\b/i },
  { key: 'aditya', re: /Aditya\s+Birla/i },
  { key: 'tata', re: /\bTata\b/i },
  { key: 'axis', re: /\bAxis\b/i },
  { key: 'dsp', re: /\bDSP\b/i }
];

function parseScheme(raw: RawScheme): NpsSchemeEntry | null {
  const code = String(raw.code ?? raw.scheme_code ?? '');
  if (!code) return null;

  const namePart = String(raw.name ?? raw.scheme_name ?? '');
  const pfmPart = String(raw.pfm ?? raw.pfm_name ?? '');
  const combined = `${pfmPart} ${namePart}`;

  const typeMatch = SCHEME_TYPE_RE.exec(combined);
  const tierMatch = TIER_RE.exec(combined);
  if (!typeMatch || !tierMatch) return null;

  const schemeType = typeMatch[1] as NpsSchemeType;
  const tier = tierMatch[1] as 'I' | 'II';
  const pfmMatch = PFM_MATCHERS.find((m) => m.re.test(combined));
  if (!pfmMatch) return null;

  return { code, pfmKey: pfmMatch.key, schemeType, tier, name: namePart || pfmPart };
}

function parseReturn(val: string | number | null | undefined): number | null {
  if (val == null) return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : n;
}

export async function getNpsSchemes(): Promise<NpsSchemeEntry[]> {
  if (schemesMemCache) return schemesMemCache;

  try {
    const stored = localStorage.getItem(SCHEMES_CACHE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { schemes: NpsSchemeEntry[]; fetchedAt: number };
      if (Date.now() - parsed.fetchedAt < SCHEMES_TTL_MS) {
        schemesMemCache = parsed.schemes;
        return schemesMemCache;
      }
    }
  } catch {
    // corrupt cache — continue to fetch
  }

  try {
    const res = await fetch(`${BASE_URL}/schemes`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = (await res.json()) as RawScheme[];
    const schemes = raw.map(parseScheme).filter((s): s is NpsSchemeEntry => s !== null);
    schemesMemCache = schemes;
    localStorage.setItem(SCHEMES_CACHE_KEY, JSON.stringify({ schemes, fetchedAt: Date.now() }));
    return schemes;
  } catch {
    return [];
  }
}

export async function findNpsSchemeCode(
  pfmKey: NpsPfmKey,
  schemeType: NpsSchemeType,
  tier: 'I' | 'II'
): Promise<string | null> {
  const schemes = await getNpsSchemes();
  return schemes.find((s) => s.pfmKey === pfmKey && s.schemeType === schemeType && s.tier === tier)?.code ?? null;
}

export async function fetchNpsNav(schemeCode: string): Promise<NpsNavDetail | null> {
  const cached = navMemCache.get(schemeCode);
  if (cached && Date.now() - cached.fetchedAt < 60 * 60 * 1000) return cached;

  try {
    const res = await fetch(`${BASE_URL}/detailed/${schemeCode}`);
    if (!res.ok) return null;
    const json = (await res.json()) as RawNavDetail;

    const navRaw = json.nav ?? json.latestNav;
    const nav = parseFloat(String(navRaw));
    if (isNaN(nav) || nav <= 0) return null;

    const r = json.returns ?? {};
    const detail: NpsNavDetail = {
      code: schemeCode,
      nav,
      date: String(json.date ?? json.latestNavDate ?? json.nav_date ?? ''),
      oneDay: parseReturn(r['1d'] ?? r['oneDay'] ?? r['1_day']),
      oneMonth: parseReturn(r['1m'] ?? r['oneMonth'] ?? r['1_month']),
      oneYear: parseReturn(r['1y'] ?? r['oneYear'] ?? r['1_year']),
      threeYear: parseReturn(r['3y'] ?? r['threeYear'] ?? r['3_year']),
      fiveYear: parseReturn(r['5y'] ?? r['fiveYear'] ?? r['5_year']),
      fetchedAt: Date.now()
    };

    navMemCache.set(schemeCode, detail);
    return detail;
  } catch {
    return null;
  }
}

export function getPfmLabel(pfmKey: string): string {
  return NPS_FUND_MANAGERS.find((m) => m.key === pfmKey)?.label ?? pfmKey;
}
