# Phase 1.5 — Track A: API Proxy Worker (DETAILED)

> **Status:** ✅ Complete. Deployed 2026-07-01 to **`https://penny-api-proxy.hesh.workers.dev`** (KV +
> D1 bound, D1 migrated, Cron `*/15` live). All 9 steps done: worker code + market Cron-snapshot
> (step 8) + client wiring + live deploy (step 9). Live smoke test passed (`/health`, `/market`,
> `/yf` MISS→HIT, `/mfapi`, `/vehicle` queued, CORS). Established the Cloudflare Workers deploy
> template for Tracks B–E.
> First backend track. Establishes the Cloudflare Workers **deploy template** reused by Tracks B–E.
> Authoritative per-track status: [`docs/MILESTONES.md`](../MILESTONES.md) / [`docs/ROADMAP.md`](../ROADMAP.md).
> Parent plan: [`phase-1.5-groups-household-os.md`](phase-1.5-groups-household-os.md) → "Track A".

## Why

Penny's client calls several external APIs directly. Problems this fixes:

- **CORS** — Yahoo Finance (`query1.finance.yahoo.com`) and vahandetails are not CORS-enabled;
  today they only work via a dev-only Vite proxy / not at all in prod.
- **N→1 collapse** — a given symbol / scheme / reg number is fetched once upstream and served
  to every user from a shared edge cache, so upstream volume is decoupled from user count.
- **Rate-limit survival** — vahandetails allows ~**1000 free calls/day, morning window only**; a
  naïve client hammers it. A shared permanent cache + a per-reg queue keeps net upstream ≈
  globally-new reg numbers/day.
- **Key custody (future)** — the same worker pattern later holds the Anthropic key server-side
  (Phase 2 Chip), so establishing it now de-risks everything after.

**Constraint:** the app must stay **fully usable with no backend**. Every client call falls back
to its current direct/cached behavior when `VITE_API_PROXY` is unset.

## Locked decisions (this session, 2026-06-27)

- **Platform:** Cloudflare Workers + KV (volatile cache + rate-limit counters) + D1 (permanent
  vehicle cache + a queue table + the daily budget counter) + a Cron trigger. No separate
  Cloudflare Queues product — the queue is a D1 table drained by Cron, which keeps the setup
  (and the resources you create) minimal. Lives in-repo at `workers/api-proxy/`, deployed
  independently. This is the template for Tracks B–E.
- **Scope (endpoints):** market + stock (Yahoo), MF NAV + search (MFAPI, also serves metals),
  **NPS** (npsnav.in), **IPO/GMP** (investorgain.com), and **vehicle** (vahandetails).
- **Tiered cache:**
  - KV TTL for volatile: market 15 min, MF NAV 24 h, metals 4 h, NPS NAV ~1 h / schemes 1 wk,
    IPO ~15 min (mirrors the current client TTLs).
  - **D1 permanent** for effectively-immutable vehicle details (make/model/registration date
    don't change) → re-adds and re-installs are cache hits, zero upstream.
- **Vahan smart queue (user-specified):** on a cache miss, attempt upstream only within the daily
  budget + working window. On **budget-exhausted / failure / out-of-window**, the reg is **queued
  (deduped per reg number)** and the user gets a friendly _"we'll have this by tomorrow morning"_
  response. A **daily Cron** drains the queue within budget; the **first success serves every**
  waiting user from D1 — no one retries manually.
- **Per-IP rate limits** via KV (defensive).
- **Deployment:** built + runnable via `wrangler dev`; a **from-scratch setup guide**
  (`workers/api-proxy/README.md`) walks creating the CF account, KV/D1/Queue resources, secrets,
  and `wrangler deploy` for dev/staging/prod. Client wires through `VITE_API_PROXY` with fallback.
- **Roadmap reconciliation:** replace the legacy phone+OTP / `phone_hash` auth design in
  `docs/ROADMAP.md` with the keypair + username + server-blind model (carried over from the
  parent plan) as part of this track's docs.

## Architecture

```
workers/api-proxy/
  wrangler.toml          # name, envs (dev/staging/prod), KV/D1/Cron bindings
  package.json           # wrangler + @cloudflare/workers-types (isolated from the app)
  tsconfig.json          # webworker lib, cloudflare types
  migrations/0001_init.sql  # D1 schema (vehicle_cache, vehicle_queue, vahan_budget)
  src/
    index.ts             # fetch() router + scheduled() cron drain
    cors.ts              # CORS headers + JSON / passthrough / preflight
    ratelimit.ts         # per-IP KV fixed-window limiter
    vahanFetch.ts        # server-side vahandetails fetch (raw JSON)
    vehicleStore.ts      # D1 ops: cache, queue, budget
    lib/                 # FRAMEWORK-FREE pure logic (unit-tested from root tests/worker/)
      upstreams.ts       # prefix → upstream URL + path parsing
      cachePolicy.ts     # resource → cache key + TTL
      vahan.ts           # budget/window/queue decisions (pure)
```

Pure logic in `src/lib/*` imports nothing from Cloudflare, so it's tested by the **main**
`npm test` gate via `tests/worker/*.test.ts`. The worker has its own `tsconfig`/`package.json`,
so it never touches the app's `tsc -b` build or `eslint src/` lint (lint-staged only covers `src/`).

## Endpoints — transparent passthrough by prefix (+ semantic vehicle)

The JSON APIs are proxied as **transparent passthroughs**: the worker forwards the full upstream
path under a prefix and caches the response in KV by path. This means the client only swaps a
**base URL** (no request/response reshaping) — honoring the master plan's "no app-logic change".

| Route                             | Forwards to                            | Cache (KV)                                       |
| --------------------------------- | -------------------------------------- | ------------------------------------------------ |
| `GET /health`                     | —                                      | —                                                |
| `GET /yf/*`                       | `https://query1.finance.yahoo.com/*`   | 15 min                                           |
| `GET /mfapi/*`                    | `https://api.mfapi.in/*`               | `/mf/<code>` 24 h · `/mf/search` 1 h · else 24 h |
| `GET /nps/*`                      | `https://npsnav.in/api/*`              | `/schemes` 1 wk · else 1 h                       |
| `GET /ig/*`                       | `https://webnodejs.investorgain.com/*` | ~15 min                                          |
| `GET /vehicle/:regno[?refresh=1]` | vahandetails (RC + challans)           | **D1 permanent** + queue                         |

Passthrough responses are the upstream JSON, with permissive CORS; upstream non-2xx maps to a
normalized `{ error }` and is **not cached**. Vehicle (semantic, since it needs D1 + queue + the
two POST upstreams combined) returns `{ status: 'ok', data: { rc, challans } }` or
`{ status: 'queued', message, etaMorningIST }`.

## Client wiring (base-URL swap only)

Add `VITE_API_PROXY`. Each client gets a `*_BASE` constant defaulting to the direct host and
overridden to `${VITE_API_PROXY}/<prefix>` when the env is set — mirroring the existing `YF_BASE`
pattern, so **unset ⇒ exactly today's behavior** (direct fetch / Vite dev proxy):

- `YF_BASE` → `${PROXY}/yf` (`priceCache.ts`, `marketDataClient.ts`, `stockApiClient.ts`)
- `MFAPI_BASE` → `${PROXY}/mfapi` (`priceCache.ts`, `mfApiClient.ts`, `marketDataClient.ts`, `metalsClient.ts`)
- `NPS_BASE` → `${PROXY}/nps` (`npsClient.ts`)
- `IG_BASE` → `${PROXY}/ig` (`ipoClient.ts`)
- Vehicle (`rcClient.ts`): when `VITE_API_PROXY` is set, call `GET ${PROXY}/vehicle/:regno` and
  handle the `queued` response (surface the friendly message; the holding saves without RC details,
  which fill in on a later fetch). When unset, keep the current direct POSTs.

## Step order

1. ✅ Plan doc + branch. 2. ✅ Scaffold (`wrangler.toml`, pkg, tsconfig, router, CORS, rate-limit,
   `/health`). 3. ✅ KV passthrough endpoints (yf/mfapi/nps/ig). 4. ✅ Vehicle: D1 cache +
   budget/window + per-reg queue + Cron drain. 5. ✅ Client wiring (+ fallback). 6. ✅ Unit tests
   (routes, cache policy, rate-limit, vahan queue). 7. ✅ Setup guide + ROADMAP reconciliation +
   status docs. 8. ✅ **Market ticker strip → Cron-refreshed snapshot** (`GET /market`, one JSON for the
   whole strip, refreshed every 15 min by Cron + edge-cached; client fetches once via
   `MARKET_SNAPSHOT`, falls back to per-ticker when no backend). Removes the per-user worker call for
   the highest-volume request — strategy §9.5. 9. ✅ **Deployed to Cloudflare** (2026-07-01): KV + D1
   created, D1 migrated (local + remote), `wrangler deploy` → `penny-api-proxy.hesh.workers.dev`, Cron
   live; local + live smoke tests passed; app pointed at it via `VITE_API_PROXY`.

> **Track A is complete** — all 9 steps done; the worker is deployed and verified live.

## Verification

- Unit: `routes`, `cachePolicy` (key+TTL per resource), `ratelimit` math, `vahan` (budget
  decrement, window check, queue dedup, drain order) — all pure, in `tests/worker/`.
- `wrangler dev` smoke: each endpoint returns data; second call is a cache hit (no upstream);
  CORS preflight passes; an exhausted Vahan budget returns `queued`; Cron drains the queue.
- App regression: with `VITE_API_PROXY` unset, all existing flows behave exactly as before.

## Deferred / follow-ups

- Merchant→category dictionary endpoint (belongs with the rules-based categorization track; serve it as a static CDN asset).
- Edge Cache API layering on top of KV for the hottest GETs.
- Moving the dev Vite `/api/yf` proxy onto the worker once deployed.

> Note: the **market ticker strip → Cron→static-CDN** move is **in Track A scope** (step 8), not
> deferred — per [`docs/BACKEND_STRATEGY.md`](../BACKEND_STRATEGY.md) §9.5. Per-scheme MF/NPS NAV and
> per-symbol stock stay cached passthrough (can't pre-generate thousands of schemes).
