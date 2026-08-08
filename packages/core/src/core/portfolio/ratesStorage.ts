// Default (Vite/web-react + tsc/vitest resolution) counterpart to ratesStorage.native.ts/.web.ts —
// same async-key-value contract, backed by `localStorage`. Metro (apps/mobile) never resolves this
// file directly (it always picks the platform-suffixed sibling first — see apps/mobile/tsconfig.json's
// `moduleSuffixes` / metro.config.js's `resolver.platforms`); this is what a plain `tsc -b`/`vitest run`
// (which do no RN platform resolution at all) actually import.
// Shared by every Cloudflare-hosted, mostly-static rate table this app caches client-side
// (`epfInterestRates.ts`, `ppfInterestRates.ts`) — generic on purpose, not EPF/PPF-specific, since
// the get/set contract is identical regardless of which table is being cached.

export async function getItem(key: string): Promise<string | null> {
  return localStorage.getItem(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  localStorage.setItem(key, value);
}
