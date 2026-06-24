// MFAPI.in client — mutual-fund search and scheme metadata.
// CORS-friendly, no API key. NAV fetching lives in core/db/priceCache.ts.

export interface MfSearchResult {
  schemeCode: string;
  schemeName: string;
}

export interface MfSchemeDetail {
  fundHouse: string;
  schemeCategory: string;
  schemeType: string;
}

// Searches schemes by name. Returns up to 8 matches; empty array on any failure.
export async function searchMfSchemes(query: string): Promise<MfSearchResult[]> {
  try {
    const res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const json = (await res.json()) as MfSearchResult[];
    return json.slice(0, 8);
  } catch {
    return [];
  }
}

// Fetches fund house / category / type for a scheme. Returns null on any failure
// so callers can preserve any existing detail.
export async function fetchMfSchemeDetail(schemeCode: string): Promise<MfSchemeDetail | null> {
  try {
    interface MfDetailResp {
      meta?: { fund_house?: string; scheme_category?: string; scheme_type?: string };
    }
    const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`);
    if (!res.ok) return null;
    const json = (await res.json()) as MfDetailResp;
    const m = json.meta;
    if (!m) return null;
    return {
      fundHouse: m.fund_house ?? '',
      schemeCategory: m.scheme_category ?? '',
      schemeType: m.scheme_type ?? ''
    };
  } catch {
    return null;
  }
}
