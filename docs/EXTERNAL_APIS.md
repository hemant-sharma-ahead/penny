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
| Yahoo Finance (`query1.finance.yahoo.com`) | Live stock prices | `packages/core/src/core/net/apiBase.constants.ts` (`YF_BASE`) | Yes — `workers/api-proxy/` (`/yf/*`), CORS + rate-limit + 15-min KV cache | Direct-call fallback if `VITE_API_PROXY` (web) / `app.json`'s `extra.apiProxyUrl` (mobile, native + web target) is unset. **`apps/mobile` wasn't actually wired to the proxy until 2026-07-27** — its `apiBase.native.ts`/`apiBase.web.ts` always called every upstream direct, invisibly on true native (CORS doesn't apply there) but hard-broken under `expo start --web` (a real browser, which does enforce CORS, and none of these upstreams send CORS headers). Fixed by adding `apiProxyUrl` to `app.json`'s `extra` and routing both mobile variants through the same deployed Worker web already uses. |
| MFAPI.in (`api.mfapi.in`) | Mutual fund NAV, scheme search | `apiBase.constants.ts` (`MFAPI_BASE`) | Yes — `/mfapi/*`, 24h (NAV) / 1h (search) KV cache | |
| npsnav.in (`npsnav.in/api`) | NPS scheme NAV | `apiBase.constants.ts` (`NPS_BASE`) | Yes — `/nps/*`, 1wk (scheme list) / 1h (NAV) KV cache | |
| investorgain (`webnodejs.investorgain.com`) | IPO listings, GMP, subscription data | `apiBase.constants.ts` (`IG_BASE`) + `packages/core/src/core/ipo/ipoClient.constants.ts` (path/year constants) | Yes — `/ig/*`, 15-min KV cache | **Broke once already**: investorgain rebuilt their site (Next.js) and moved `cloud/report/data-read`/`cloud/ipo/ipo-subscription-read` to `cloud/v2/...` with no notice — same response shape, just a version-prefixed path. Fixed in both `ipoClient.ts` and `ipoClient.native.ts`. If GMP/subscription data ever silently stops working again, check this exact failure mode first (curl the endpoint directly — investorgain returns a JSON `{"msg":"API not found"}` body with a `200`/`404`, not a network error). |
| ET Markets / Mint / RBI / SEBI RSS feeds | Finance news | `packages/core/src/core/news/newsClient.constants.ts` (4 feed URLs) + `apiBase.ts`/`apiBase.web.ts`/`apiBase.native.ts` (`NEWS_PROXY_BASE`) | Yes — `workers/api-proxy/` (`/rss/:feedId`), CORS + 45-min KV cache, dedicated route (`src/news.ts`), not the generic prefix passthrough (4 different publisher hosts, XML not JSON) | **Moved off AllOrigins on 2026-07-27**: the public `api.allorigins.win` proxy (still `NEWS_PROXY` in `newsClient.constants.ts`, kept as the no-backend fallback) started 408-timing-out on the RBI/SEBI feeds specifically. `newsClient.ts`/`newsClient.native.ts` now prefer the Worker route (`NEWS_PROXY_BASE`) when `VITE_API_PROXY`/`apiProxyUrl` is configured, falling back to AllOrigins only when no Worker is set up. Publisher RSS feeds don't send CORS headers, so *some* proxy is required either way — this just replaces the unreliable public one with Penny's own cached route. |
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
