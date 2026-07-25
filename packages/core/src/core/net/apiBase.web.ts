// Metro-web counterpart to apiBase.ts. `apps/mobile` targets iOS/Android/web (react-native-web);
// Metro's platform resolution only picks `.native.ts` for iOS/Android, not the `web` target, so without
// this file Metro falls through to the bare `apiBase.ts` — which reads Vite's `import.meta.env` at
// module load (several top-level consts), a global Metro never defines (crashes immediately on import,
// before any fallback branch runs). Identical to `apiBase.native.ts` — `expo-constants` behaves the same
// under Expo's web target as it does natively, so this is a straight duplicate, not a different
// implementation. `AUTH_BASE`/`GROUPS_BASE` read the real deployed worker URLs from `app.json`'s
// `extra`, same non-secret public worker URLs already committed in apps/web-legacy/.env.production.

import Constants from 'expo-constants';

export const YF_BASE: string = 'https://query1.finance.yahoo.com';
export const MFAPI_BASE: string = 'https://api.mfapi.in';
export const NPS_BASE: string = 'https://npsnav.in/api';
export const IG_BASE: string = 'https://webnodejs.investorgain.com';
export const VEHICLE_PROXY: string | null = null;
export const MARKET_SNAPSHOT: string | null = null;

const extra = Constants.expoConfig?.extra;

export const AUTH_BASE: string | null = (extra?.authProxyUrl as string | undefined) ?? null;
export const GROUPS_BASE: string | null = (extra?.groupsProxyUrl as string | undefined) ?? null;
