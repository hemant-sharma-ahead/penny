// Metro/RN counterpart to apiBase.ts: Vite injects `import.meta.env` at build time, but Metro/Hermes
// has no such global at all (a bare read throws/is `undefined`, unlike the ReferenceError patterns
// `window`-using core code hit before — see useTxnRefresh/useDataRefresh's `.native.ts` fixes). This
// mirrors the platform-extension resolution `moduleSuffixes` already sets up in apps/mobile/tsconfig.json.
//
// Yahoo/MFAPI/NPS/investorgain now route through the same deployed `penny-api-proxy` Worker
// `apps/web-react` already uses (via `app.json`'s `extra.apiProxyUrl`, the same non-secret public
// worker URL already committed in apps/web-react/.env.production) — found missing entirely via
// on-device/on-web testing, 2026-07-27: a direct `fetch()` to Yahoo Finance works fine from a true
// native app (CORS is a browser-only enforcement, native isn't one), but the exact same code running
// under `expo start --web` (react-native-web in a real browser) hit hard CORS failures, since Yahoo/
// MFAPI/investorgain don't send CORS headers. Routing native through the proxy too (not just the web
// target) was a deliberate choice for consistency and to get the Worker's 15-min KV caching/rate-limit
// protection everywhere, not just on web — every native install was previously hitting these upstreams
// directly, uncached, on every price refresh.
import Constants from 'expo-constants';
import { YF_DIRECT, MFAPI_DIRECT, NPS_DIRECT, IG_DIRECT } from './apiBase.constants';

const extra = Constants.expoConfig?.extra;

const PROXY = (extra?.apiProxyUrl as string | undefined)?.replace(/\/$/, '');

export const YF_BASE: string = PROXY ? `${PROXY}/yf` : YF_DIRECT;
export const MFAPI_BASE: string = PROXY ? `${PROXY}/mfapi` : MFAPI_DIRECT;
export const NPS_BASE: string = PROXY ? `${PROXY}/nps` : NPS_DIRECT;
export const IG_BASE: string = PROXY ? `${PROXY}/ig` : IG_DIRECT;
export const VEHICLE_PROXY: string | null = PROXY ? `${PROXY}/vehicle` : null;
export const MARKET_SNAPSHOT: string | null = PROXY ? `${PROXY}/market` : null;
export const NEWS_PROXY_BASE: string | null = PROXY ? `${PROXY}/rss` : null;
export const EPF_RATES_BASE: string | null = PROXY ? `${PROXY}/epf-rates` : null;
export const PPF_RATES_BASE: string | null = PROXY ? `${PROXY}/ppf-rates` : null;

export const AUTH_BASE: string | null = (extra?.authProxyUrl as string | undefined) ?? null;
export const GROUPS_BASE: string | null = (extra?.groupsProxyUrl as string | undefined) ?? null;
