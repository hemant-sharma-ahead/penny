// Metro-web + apps/web-react counterpart to ratesStorage.ts's async-key-value contract, backed by
// `localStorage` (synchronous, wrapped in a resolved Promise to match the async signature both
// platform variants share). Shared by every Cloudflare-hosted, mostly-static rate table this app
// caches client-side (`epfInterestRates.ts`, `ppfInterestRates.ts`).

export async function getItem(key: string): Promise<string | null> {
  return localStorage.getItem(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  localStorage.setItem(key, value);
}
