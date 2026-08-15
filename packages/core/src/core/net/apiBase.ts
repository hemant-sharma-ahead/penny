// Central resolution of external-API base URLs. When `VITE_API_PROXY` is set, every external call
// routes through the Penny API Proxy Worker (CORS fix + shared cache); when unset, calls go direct
// (or via the Vite dev proxy for Yahoo) — i.e. exactly today's no-backend behavior.
// See docs/plans/phase-1.5-track-A-api-proxy.md and workers/api-proxy/.

import { YF_DIRECT, MFAPI_DIRECT, NPS_DIRECT, IG_DIRECT } from './apiBase.constants';

const PROXY = (import.meta.env.VITE_API_PROXY as string | undefined)?.replace(/\/$/, '');

/** Yahoo Finance. Priority: API proxy → legacy VITE_YF_PROXY → Vite dev proxy → direct. */
export const YF_BASE: string = PROXY
  ? `${PROXY}/yf`
  : ((import.meta.env.VITE_YF_PROXY as string | undefined) ?? (import.meta.env.DEV ? '/api/yf' : YF_DIRECT));

/** MFAPI (mutual-fund NAV + search; also metals). */
export const MFAPI_BASE: string = PROXY ? `${PROXY}/mfapi` : MFAPI_DIRECT;

/** npsnav.in (NPS NAV + scheme list). Includes the upstream `/api` path. */
export const NPS_BASE: string = PROXY ? `${PROXY}/nps` : NPS_DIRECT;

/** investorgain.com (IPO list + GMP + subscription). */
export const IG_BASE: string = PROXY ? `${PROXY}/ig` : IG_DIRECT;

/** Vehicle proxy base (`${PROXY}/vehicle`), or null when no backend is configured (direct POSTs). */
export const VEHICLE_PROXY: string | null = PROXY ? `${PROXY}/vehicle` : null;

/** Market snapshot endpoint (one Cron-refreshed JSON for the whole ticker strip), or null when no
 *  backend is configured (client falls back to per-ticker fetches). */
export const MARKET_SNAPSHOT: string | null = PROXY ? `${PROXY}/market` : null;

/** EPF interest rate table (2026-08-07, EPF passbook import — see
 *  docs/plans/epf-passbook-import.md §7) — one small, mostly-static JSON route on the same worker,
 *  not a dedicated worker (rates change at most once a year). Null when no backend is configured;
 *  the app then falls back to its own baked-in rate table (`epfInterestRates.ts`'s
 *  `EPF_RATE_PERIODS_FALLBACK`) and never blocks on network. */
export const EPF_RATES_BASE: string | null = PROXY ? `${PROXY}/epf-rates` : null;

/** PPF interest rate table (2026-08-08) — same shape/rationale as `EPF_RATES_BASE` above. Null when
 *  no backend is configured; the app then falls back to its own baked-in rate table
 *  (`ppfInterestRates.ts`'s `PPF_RATE_TABLE_FALLBACK`) and never blocks on network. */
export const PPF_RATES_BASE: string | null = PROXY ? `${PROXY}/ppf-rates` : null;

/** SMS transaction-parsing templates (2026-08-15, docs/plans/sms-transaction-tracking.md §5) — same
 *  shape/rationale as `EPF_RATES_BASE` above: a small, mostly-static JSON route so a bank changing
 *  its SMS wording is a backend redeploy, not an app-store release. Null when no backend is
 *  configured; the app then falls back to its own bundled template set
 *  (`core/sms-import/smsPatterns.ts`'s `SMS_PATTERNS_FALLBACK`) and never blocks on network. Only
 *  the templates themselves cross this URL — raw SMS text and every field parsed from it stay
 *  on-device always (see that file's own doc comment). */
export const SMS_PATTERNS_BASE: string | null = PROXY ? `${PROXY}/sms-patterns` : null;

/** News RSS proxy (`${PROXY}/rss/<feedId>`), or null when no backend is configured — the client then
 *  falls back to the public AllOrigins proxy (see newsClient.constants.ts). Added after AllOrigins
 *  started 408-timing-out on the RBI/SEBI feeds specifically (2026-07-27); routing through our own
 *  cached Worker route (news.ts) removes that third-party dependency entirely once configured. */
export const NEWS_PROXY_BASE: string | null = PROXY ? `${PROXY}/rss` : null;

/** Auth/Identity worker base (Phase 1.5 Track C). Prefers a dedicated `VITE_AUTH_PROXY` (the
 *  penny-auth worker's own URL on `*.workers.dev`), falling back to `${VITE_API_PROXY}/auth` for the
 *  future single-gateway (custom-domain) routing. Null when no backend is configured — account claim
 *  / sync is then unavailable and the app stays fully usable offline. */
const AUTH = (import.meta.env.VITE_AUTH_PROXY as string | undefined)?.replace(/\/$/, '');
export const AUTH_BASE: string | null = AUTH ?? (PROXY ? `${PROXY}/auth` : null);

/** Groups worker base (Phase 1.5 Track E). Prefers a dedicated `VITE_GROUPS_PROXY` (the penny-groups
 *  worker's own URL on `*.workers.dev`), falling back to `${VITE_API_PROXY}/groups` for the future
 *  single-gateway routing. Null when no backend is configured — groups are then unavailable and the
 *  app stays fully usable offline. */
const GROUPS = (import.meta.env.VITE_GROUPS_PROXY as string | undefined)?.replace(/\/$/, '');
export const GROUPS_BASE: string | null = GROUPS ?? (PROXY ? `${PROXY}/groups` : null);
