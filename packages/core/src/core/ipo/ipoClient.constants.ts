// Shared across ipoClient.ts (web) and ipoClient.native.ts — kept in exactly one place per the
// platform-variance-minimization principle (docs/ARCHITECTURE.md). These were previously hardcoded
// independently in both files; when investorgain moved their API to a `v2`-prefixed path, both copies
// needed the identical fix, which is exactly the failure mode this file exists to prevent from
// recurring. See docs/EXTERNAL_APIS.md for the investorgain-outage story in full.

// Update every April when the Indian financial year rolls over (FY starts April 1).
export const IPO_API_YEAR = '2026';
export const IPO_API_FY = '2026-27';

// investorgain rebuilt their site (Next.js/Turbopack) and retired `cloud/report/data-read`/
// `cloud/ipo/ipo-subscription-read` in favor of `cloud/v2/...` — same response shape, just a
// version-prefixed path.
export const IPO_BASE_PATH = 'cloud/v2/report/data-read';
export const IPO_SUBSCRIPTION_PATH = 'cloud/v2/ipo/ipo-subscription-read';

export const IPO_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
