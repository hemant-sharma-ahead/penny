# External APIs

A registry of every external (non-Penny-owned) API the app calls, in one place — so a
base-URL change (like the IPO API's silent `v2` migration, caught this session) only ever
needs a single fix location, and so it's obvious at a glance what Penny depends on and why.

**The rule this doc exists to enforce** (see `docs/ARCHITECTURE.md`'s platform-variance-
minimization principle and `.claude/commands/penny-standards.md`): every base URL/literal
below lives in exactly one canonical, unsuffixed `*.constants.ts` file, imported by both
the web and native platform variants. Never hardcode a copy of any of these URLs anywhere
else — if you need one, import the constant.

| API | Purpose | Canonical constants file | Proxied via a Worker? | Notes |
| --- | --- | --- | --- | --- |
| Yahoo Finance (`query1.finance.yahoo.com`) | Live stock prices | `packages/core/src/core/net/apiBase.constants.ts` (`YF_BASE`) | Yes — `workers/api-proxy/` (`/yf/*`), CORS + rate-limit + 15-min KV cache | Direct-call fallback if `VITE_API_PROXY`/native equivalent is unset. |
| MFAPI.in (`api.mfapi.in`) | Mutual fund NAV, scheme search | `apiBase.constants.ts` (`MFAPI_BASE`) | Yes — `/mfapi/*`, 24h (NAV) / 1h (search) KV cache | |
| npsnav.in (`npsnav.in/api`) | NPS scheme NAV | `apiBase.constants.ts` (`NPS_BASE`) | Yes — `/nps/*`, 1wk (scheme list) / 1h (NAV) KV cache | |
| investorgain (`webnodejs.investorgain.com`) | IPO listings, GMP, subscription data | `apiBase.constants.ts` (`IG_BASE`) + `packages/core/src/core/ipo/ipoClient.constants.ts` (path/year constants) | Yes — `/ig/*`, 15-min KV cache | **Broke once already**: investorgain rebuilt their site (Next.js) and moved `cloud/report/data-read`/`cloud/ipo/ipo-subscription-read` to `cloud/v2/...` with no notice — same response shape, just a version-prefixed path. Fixed in both `ipoClient.ts` and `ipoClient.native.ts`. If GMP/subscription data ever silently stops working again, check this exact failure mode first (curl the endpoint directly — investorgain returns a JSON `{"msg":"API not found"}` body with a `200`/`404`, not a network error). |
| AllOrigins (`api.allorigins.win`) | RSS→JSON proxy for finance news (ET Markets, Mint, RBI, SEBI feeds) | `packages/core/src/core/news/newsClient.constants.ts` (proxy base + 4 feed URLs) | No — a public third-party proxy, not one of Penny's own Workers. A Cloudflare Worker is the noted upgrade path if rate limits/reliability become a problem (see `docs/features/news.md`). | Publisher RSS feeds don't send CORS headers, so a direct client fetch is blocked regardless of CSP — this proxy is the only reason News works without a backend. |
| Google Drive API (`googleapis.com`) | User-owned cloud backup (Model B — Penny's servers never see this data) | `packages/core/src/core/sync/providers/googleDriveProvider.ts` (web) — `SCOPE`/`FILE_NAME`/`GIS_SRC` constants at the top of the file | No — direct client-to-Google, OAuth via the user's own Google account | `drive.appdata` scope only (app-private folder, invisible in the user's normal Drive UI). iCloud equivalent is code-complete but dormant (no Capacitor native bridge yet — see `docs/ROADMAP.md`). |
| Vahan (vehicle registration lookup) | Real-asset vehicle tracking (RC details, IRDA depreciation) | N/A on the client — server-side only | Yes, exclusively — `workers/api-proxy/`'s permanent D1 cache + Cron-drained queue (900-call/day budget) | No direct client call exists; this is the one external API Penny never calls from the app itself, only from the Worker. |

## Anthropic (Chip AI)

Not yet live (Phase 2 — see `docs/ROADMAP.md`). When enabled, `buildUserContext()` in
`packages/core/src/core/ai-safety/` is the **only** permitted path to the Anthropic SDK —
enforced by ESLint (`@anthropic-ai/sdk` may only be imported from
`packages/core/src/core/ai-safety/anthropicClient.ts`). See `docs/PRIVACY.md` for the PII
pipeline every request goes through first.

## Adding a new external API

See `.claude/commands/penny-api-client.md` for the full checklist (permitted-domain list,
no API keys in code, caching pattern, CORS/Worker-proxy requirement, graceful degradation
when unset). In short: add the base URL to a new or existing `*.constants.ts` file
(never inline it in the calling code), add a row to this table, and if it needs a backend
proxy, add a route to `workers/api-proxy/` rather than standing up a new Worker.
