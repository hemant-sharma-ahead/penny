// Pure routing for the transparent passthrough prefixes. No Cloudflare imports — unit-tested
// from the app's main test suite (tests/worker/).

/** Prefix → upstream origin (+ optional base path). The worker forwards `rest` (and query) verbatim. */
export const UPSTREAM: Record<string, string> = {
  yf: 'https://query1.finance.yahoo.com',
  mfapi: 'https://api.mfapi.in',
  nps: 'https://npsnav.in/api',
  ig: 'https://webnodejs.investorgain.com'
};

export interface ParsedPath {
  prefix: string;
  /** Everything after the prefix, leading slash included (or '' ). */
  rest: string;
}

/** Split `/yf/v8/finance/...` → { prefix: 'yf', rest: '/v8/finance/...' }. */
export function parsePath(pathname: string): ParsedPath | null {
  const m = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!m || !m[1]) return null;
  return { prefix: m[1], rest: m[2] ?? '' };
}

/** Build the full upstream URL for a known prefix, or null if the prefix is unknown. */
export function upstreamUrl(prefix: string, rest: string, search: string): string | null {
  const base = UPSTREAM[prefix];
  return base ? base + rest + search : null;
}

export function isKnownPrefix(prefix: string): boolean {
  return prefix in UPSTREAM;
}
