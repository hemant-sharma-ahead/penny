# Penny Auth/Identity Worker

Username claim + device registration + challenge/response signed-request auth (Phase 1.5 Track C).
This is the per-user identity foundation Tracks D (sync) and E (groups) build on.

Built from the **Track A worker template** (`workers/api-proxy/`). Same Wrangler + KV + D1 conventions.

> **Model B — the server stores identity metadata only.** `users` (userId, optional username, public
> keys) + `devices` (public keys). **No financial data, no PII, no personal backup blob** — personal
> backup lives in the user's own Drive/iCloud. See [`docs/BACKEND_STRATEGY.md`](../../docs/BACKEND_STRATEGY.md) §5.

> The app works with **no backend**. This worker is additive and **dark by default**: the client's
> claim/sync UI is gated behind the `sync` entitlement (off in normal builds). When `VITE_AUTH_PROXY`
> (or `VITE_API_PROXY`) is unset, account claim is simply unavailable and the app is unaffected.

---

## Endpoints

| Route                 | Method | Signed | Purpose                                                         |
| --------------------- | ------ | ------ | --------------------------------------------------------------- |
| `/health`             | GET    | no     | Liveness                                                        |
| `/username/check`     | POST   | no     | `{username}` → `{available}` (format-validated + D1 uniqueness) |
| `/register`           | POST   | no     | Claim: upsert user (first-claim-wins username) + first device   |
| `/challenge?user_id=` | GET    | no     | Issue a single-use nonce (KV, 60s TTL)                          |
| `/whoami`             | GET    | yes    | `{user_id, username}` — proves the challenge→sign→verify loop   |
| `/device`             | POST   | yes    | Register an additional device for the authenticated user        |

**Signed requests** carry `x-penny-user`, `x-penny-device`, `x-penny-nonce`, `x-penny-sig`. The
signature is ECDSA P-256 (SHA-256) over `nonce\nMETHOD\npath\nsha256(body)`, verified against the
device's stored public key. The nonce is single-use (consumed from KV on verify). No passwords or
passphrase ever reach the server. The router also accepts an optional `/auth` path prefix so it works
standalone or behind a future single gateway.

---

## Deploy

```bash
cd workers/auth
npm install
npx wrangler login

# KV: reuse the existing api-proxy namespace (already set in wrangler.toml — nonce/rate-limit keys are
# prefixed, so no collision with the market/vehicle cache). Or create a dedicated one and paste its id.
# D1: dedicated database (kept separate from the api-proxy cache + groups). Paste the id into wrangler.toml:
npx wrangler d1 create penny_auth           # → <DEV_D1_ID>

# Apply the D1 schema:
npm run db:migrate:local
npm run db:migrate:remote                   # after first deploy

# Run locally + smoke test:
npm run dev                                 # → http://localhost:8788 (pick a port distinct from api-proxy)
curl http://localhost:8788/health

# Deploy:
npm run deploy                              # or deploy:staging / deploy:prod
```

Point the app at it (repo-root `.env`): `VITE_AUTH_PROXY=https://penny-auth.<you>.workers.dev`
(or, once both workers sit behind one custom domain, rely on `VITE_API_PROXY` + the `/auth` prefix).

## Smoke test the auth loop

```bash
# register (client normally does this) → then challenge → signed /whoami
curl -X POST localhost:8788/username/check -d '{"username":"aarav_s"}'
curl "localhost:8788/challenge?user_id=<uuid>"
```

A signed `/whoami` with a valid signature returns the identity; a reused nonce or bad signature
returns `401`.

## Operations

```bash
npm run tail                                # live logs (never logs PII)
npx wrangler d1 execute penny_auth --command "SELECT COUNT(*) FROM users" --local
npx wrangler deployments list               # history; `wrangler rollback` to revert
```

D1 migrations are forward-only — add new ones as `migrations/NNNN_*.sql`.
