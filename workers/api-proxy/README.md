# Penny API Proxy Worker

Transparent passthrough + tiered cache for Penny's external finance APIs (Phase 1.5 Track A).
It **fixes CORS**, **collapses N user calls into 1 upstream call** via a shared edge cache, and
keeps the rate-limited **vahandetails** vehicle API alive with a permanent cache + a morning queue.

This is also the **deploy template** for the later backend workers (Tracks B–E).

> **Live:** deployed 2026-07-01 at **`https://penny-api-proxy.hesh.workers.dev`** (KV + D1 bound, D1
> migrated, Cron `*/15` active). The app points at it via `VITE_API_PROXY`.

> The app works with **no backend**. This worker is additive: when `VITE_API_PROXY` is unset, the
> client falls back to calling upstreams directly (today's behavior). Deploy this when you want
> CORS fixed in production and shared caching.

---

## What it does

| Route | Forwards to | Cache |
|---|---|---|
| `GET /health` | — | — |
| `GET /market` | Cron-refreshed snapshot of the whole ticker strip (one JSON) | KV + edge cache (refreshed every 15 min by Cron) |
| `GET /yf/*` | `query1.finance.yahoo.com/*` (Yahoo) | KV 15 min |
| `GET /mfapi/*` | `api.mfapi.in/*` | KV: NAV 24 h · search 1 h |
| `GET /nps/*` | `npsnav.in/api/*` | KV: schemes 1 wk · NAV 1 h |
| `GET /ig/*` | `webnodejs.investorgain.com/*` (IPO/GMP) | KV ~15 min |
| `GET /rss/:feedId` | One of 4 fixed news RSS feeds (`et-markets`, `mint`, `rbi`, `sebi`) — see `src/news.ts` | KV 45 min |
| `GET /vehicle/:regno[?refresh=1]` | vahandetails (RC + challans) | **D1 permanent** + queue |

Vehicle returns `{ status: 'ok', data }`, or `{ status: 'queued', message, etaMorningIST }` when the
daily budget/window can't serve it — the reg is queued (deduped) and a morning **Cron** fetches it;
the first success serves every waiting user. No manual retry.

---

## Prerequisites

- A **Cloudflare account** (free): https://dash.cloudflare.com/sign-up
- **Node 18+** and this repo cloned.

## 1 — Install + log in

```bash
cd workers/api-proxy
npm install                 # installs wrangler + types locally
npx wrangler login          # opens a browser to authorize your Cloudflare account
npx wrangler whoami         # confirm you're logged in
```

## 2 — Create the resources (dev first)

```bash
# KV namespace (cache + rate-limit counters)
npx wrangler kv namespace create CACHE
#   → copy the printed id

# D1 database (vehicle cache + queue + budget)
npx wrangler d1 create penny_proxy
#   → copy the printed database_id
```

Paste both ids into **`wrangler.toml`**, replacing `<DEV_KV_ID>` and `<DEV_D1_ID>`.

## 3 — Apply the D1 schema

```bash
npx wrangler d1 migrations apply penny_proxy --local    # for local dev
npx wrangler d1 migrations apply penny_proxy --remote    # for the deployed worker
```

## 4 — Run locally

```bash
npm run dev                 # wrangler dev → http://localhost:8787
```

Smoke-test it:

```bash
curl http://localhost:8787/health
curl http://localhost:8787/market                                                # whole ticker strip (Cron snapshot)
curl "http://localhost:8787/yf/v8/finance/chart/%5ENSEI?interval=1d&range=2d"   # Nifty 50
curl "http://localhost:8787/mfapi/mf/140088"                                     # an MF NAV
curl "http://localhost:8787/rss/sebi"                                            # SEBI RSS feed (XML)
curl "http://localhost:8787/vehicle/KA03MN5678"                                  # vehicle (ok or queued)
```

A second call to the same URL returns `x-proxy-cache: HIT` (no upstream call).

## 5 — Point the app at it (optional, for local end-to-end)

In the **repo root** `.env` (or `.env.local`):

```
VITE_API_PROXY=http://localhost:8787
```

Then `npm run dev` (root). With it unset, the app calls upstreams directly as before.

## 6 — Deploy

```bash
npm run deploy              # default env → https://penny-api-proxy.<you>.workers.dev
# or staging / prod (after filling their ids in wrangler.toml + applying migrations per env):
npm run deploy:staging
npm run deploy:prod
```

Set the production app build to use the deployed URL:

```
VITE_API_PROXY=https://penny-api-proxy.<you>.workers.dev
```

### Optional: override the vahandetails key

The vahandetails key is public (shipped in their own frontend). To override it with your own:

```bash
npx wrangler secret put VAHAN_API_KEY            # default env
npx wrangler secret put VAHAN_API_KEY --env production
```

---

## How the Vahan queue works (the important bit)

vahandetails allows ~**1000 free upstream calls/day, morning window only**. Each vehicle lookup is
2 calls (RC + challans), so the worker budgets **900 calls/day** (~450 vehicles) and only fetches
inside **06:00–12:00 IST**.

- **Cache hit** → served from D1 forever (make/model/registration never change). Re-adding the same
  vehicle, or a different user looking it up, costs **zero** upstream calls.
- **Miss, in-window, budget left** → fetched now, cached, served.
- **Miss, out-of-window or budget exhausted, or upstream failed** → the reg is **queued (deduped)**
  and the user gets a friendly *"we'll have it by tomorrow morning"* response.
- A **Cron** (06:00 / 08:30 / 11:30 IST) drains the queue within budget. The **first success serves
  every** user who asked for that reg. After ~5 failed mornings a reg is dropped from the queue.

Net upstream volume ≈ **globally-new reg numbers per day** — independent of user count.

---

## Operations

```bash
npm run tail                        # live logs (never logs PII)
npx wrangler d1 execute penny_proxy --command "SELECT COUNT(*) FROM vehicle_queue" --local
npx wrangler deployments list       # history; `wrangler rollback` to revert
```

D1 migrations are forward-only — write new ones as `migrations/NNNN_*.sql`.
