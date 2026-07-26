// Raw upstream URLs, genuinely identical across every platform variant (base `apiBase.ts`'s
// no-proxy fallback, `apiBase.web.ts`, `apiBase.native.ts`) — kept in exactly one place per the
// platform-variance-minimization principle (docs/ARCHITECTURE.md), after an IPO API URL fix once had
// to be applied in two files independently and silently diverged. See docs/EXTERNAL_APIS.md for the
// full external-API registry these feed.

export const YF_DIRECT = 'https://query1.finance.yahoo.com';
export const MFAPI_DIRECT = 'https://api.mfapi.in';
export const NPS_DIRECT = 'https://npsnav.in/api';
export const IG_DIRECT = 'https://webnodejs.investorgain.com';
