// Pure cache-policy: which KV key + TTL a passthrough request gets. Mirrors the client-side TTLs.
// No Cloudflare imports — unit-tested from the app's main test suite (tests/worker/).

export const TTL = {
  yf: 15 * 60, // market/stock — 15 min
  mfDefault: 24 * 60 * 60, // MF NAV — 24 h
  mfSearch: 60 * 60, // MF search — 1 h
  npsSchemes: 7 * 24 * 60 * 60, // NPS scheme list — 1 week
  npsDefault: 60 * 60, // NPS NAV — 1 h
  ig: 15 * 60, // IPO / GMP — 15 min
  fallback: 5 * 60
} as const;

/** Seconds to cache a passthrough response for, by prefix + upstream path. */
export function ttlFor(prefix: string, rest: string): number {
  switch (prefix) {
    case 'yf':
      return TTL.yf;
    case 'mfapi':
      return rest.startsWith('/mf/search') ? TTL.mfSearch : TTL.mfDefault;
    case 'nps':
      return rest.startsWith('/schemes') ? TTL.npsSchemes : TTL.npsDefault;
    case 'ig':
      return TTL.ig;
    default:
      return TTL.fallback;
  }
}

/** Deterministic KV key for a passthrough request (path + query, so different params cache apart). */
export function cacheKey(prefix: string, rest: string, search: string): string {
  return `proxy:${prefix}:${rest}${search}`;
}
