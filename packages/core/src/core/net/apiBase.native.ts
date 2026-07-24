// Metro/RN counterpart to apiBase.ts: Vite injects `import.meta.env` at build time, but Metro/Hermes
// has no such global at all (a bare read throws/is `undefined`, unlike the ReferenceError patterns
// `window`-using core code hit before — see useTxnRefresh/useDataRefresh's `.native.ts` fixes). This
// mirrors the platform-extension resolution `moduleSuffixes` already sets up in apps/mobile/tsconfig.json,
// reproducing exactly the same "no backend configured" fallback branch every export below already has
// for web when `VITE_API_PROXY` is unset — which is today's real state for the finance-data bases below
// (no market/vehicle backend gating exists yet for mobile). `AUTH_BASE`/`GROUPS_BASE` (Track C
// prerequisite) now read the real deployed worker URLs from `app.json`'s `extra` — same non-secret,
// public worker URLs already committed in apps/web-legacy/.env.production, just read via
// `expo-constants` instead of Vite's `import.meta.env`.

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
