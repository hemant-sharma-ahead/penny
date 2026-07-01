// Central resolution of external-API base URLs. When `VITE_API_PROXY` is set, every external call
// routes through the Penny API Proxy Worker (CORS fix + shared cache); when unset, calls go direct
// (or via the Vite dev proxy for Yahoo) — i.e. exactly today's no-backend behavior.
// See docs/plans/phase-1.5-track-A-api-proxy.md and workers/api-proxy/.

const PROXY = (import.meta.env.VITE_API_PROXY as string | undefined)?.replace(/\/$/, '');

/** Yahoo Finance. Priority: API proxy → legacy VITE_YF_PROXY → Vite dev proxy → direct. */
export const YF_BASE: string = PROXY
  ? `${PROXY}/yf`
  : ((import.meta.env.VITE_YF_PROXY as string | undefined) ??
    (import.meta.env.DEV ? '/api/yf' : 'https://query1.finance.yahoo.com'));

/** MFAPI (mutual-fund NAV + search; also metals). */
export const MFAPI_BASE: string = PROXY ? `${PROXY}/mfapi` : 'https://api.mfapi.in';

/** npsnav.in (NPS NAV + scheme list). Includes the upstream `/api` path. */
export const NPS_BASE: string = PROXY ? `${PROXY}/nps` : 'https://npsnav.in/api';

/** investorgain.com (IPO list + GMP + subscription). */
export const IG_BASE: string = PROXY ? `${PROXY}/ig` : 'https://webnodejs.investorgain.com';

/** Vehicle proxy base (`${PROXY}/vehicle`), or null when no backend is configured (direct POSTs). */
export const VEHICLE_PROXY: string | null = PROXY ? `${PROXY}/vehicle` : null;

/** Market snapshot endpoint (one Cron-refreshed JSON for the whole ticker strip), or null when no
 *  backend is configured (client falls back to per-ticker fetches). */
export const MARKET_SNAPSHOT: string | null = PROXY ? `${PROXY}/market` : null;
