// Metro-web counterpart to apiBase.ts. `apps/mobile` targets iOS/Android/web (react-native-web);
// Metro's platform resolution only picks `.native.ts` for iOS/Android, not the `web` target, so without
// this file Metro falls through to the bare `apiBase.ts` — which reads Vite's `import.meta.env` at
// module load (several top-level consts), a global Metro never defines (crashes immediately on import,
// before any fallback branch runs). Identical to `apiBase.native.ts` — `expo-constants` behaves the same
// under Expo's web target as it does natively, so this is a straight duplicate, not a different
// implementation (see that file's comment for why Yahoo/MFAPI/NPS/investorgain now route through the
// `penny-api-proxy` Worker instead of direct — this is specifically where that fix matters most, since
// the web target is the one actually subject to browser CORS enforcement).
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

export const AUTH_BASE: string | null = (extra?.authProxyUrl as string | undefined) ?? null;
export const GROUPS_BASE: string | null = (extra?.groupsProxyUrl as string | undefined) ?? null;
