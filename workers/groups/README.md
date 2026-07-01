# Penny Groups Worker (Phase 1.5 Track E)

Shared-ledger relay for **Groups & Household OS**. Lets claimed accounts create groups, invite/join
members, relay wrapped Group-Key grants, and append/fetch group events. **Model B / ciphertext-only:**
the server never sees the group name (`enc_name`), member names, financial data, or Group Keys. Event
bodies live in R2 as `AES-GCM(GroupKey_epoch, eventJson)`; grants are wrapped to a member's ECDH key.

Mirrors the Track A (`workers/api-proxy/`) and Track C (`workers/auth/`) templates.

## Auth model

Same challenge/response signed requests as the auth worker. The groups worker:

1. Issues its own single-use nonces via `GET /challenge?user_id=…` (own KV, 60s TTL).
2. Verifies the request signature (`nonce\nMETHOD\npath\nsha256(body)`) against the device's signing
   key, read from the **auth** worker's `devices` table via the read-only `AUTH_DB` binding.
3. Adds a **membership** check (and a **role** check where needed) against its own `group_members`.

The client uses `signedFetch(path, init, GROUPS_BASE)` — the same choke point as Tracks C/D.

## Endpoints

| Method + path                | Auth                | Purpose                                             |
| ---------------------------- | ------------------- | --------------------------------------------------- |
| `GET  /health`               | none                | Liveness                                            |
| `GET  /challenge?user_id`    | none                | Single-use nonce                                    |
| `POST /group`                | signed              | Create group (caller becomes owner)                 |
| `GET  /group/:id`            | member              | Group metadata (`enc_name`, epoch, role, …)         |
| `POST /group/:id/invite`     | admin/owner         | Create invite (stores `SHA-256(secret)` only)       |
| `POST /invite/redeem`        | signed              | Join via `token_hash`; returns group meta           |
| `POST /invite/revoke`        | admin/owner         | Revoke an invite                                    |
| `GET  /group/:id/members`    | member              | Members + each member's wrapping key (for grants)   |
| `POST /group/:id/member`     | self / admin/owner  | `leave` \| `remove` \| `set_role`                   |
| `POST /group/:id/grant`      | admin/owner         | Relay wrapped Group-Key grant(s) to a member        |
| `GET  /group/:id/grants`     | member              | Fetch my wrapped grants (unwrap locally)            |
| `POST /group/:id/events`     | member (active)     | Append event ciphertext → R2, server assigns `seq`  |
| `GET  /group/:id/events?since`| member             | Fetch events after `seq`                            |
| `POST /group/:id/close`      | admin/owner         | Settle & close → events frozen; bumps epoch         |
| `POST /group/:id/reopen`     | admin/owner         | Reopen a closed group                               |

## Setup

```bash
cd workers/groups
npm install

# KV (nonces + rate limit)
wrangler kv namespace create CACHE            # → paste id into wrangler.toml

# D1 (groups) + apply migration
wrangler d1 create penny_groups               # → paste database_id into wrangler.toml
npm run db:migrate:remote

# Bind the EXISTING auth D1 read-only (device signing/wrapping keys)
#   copy penny_auth's database_id from workers/auth/wrangler.toml into the AUTH_DB binding

# R2 (event bodies)
wrangler r2 bucket create penny-groups-events

npm run type-check
npm run deploy                                # → penny-groups.<subdomain>.workers.dev
```

Then set the client env: `VITE_GROUPS_PROXY=https://penny-groups.<subdomain>.workers.dev`
(falls back to `${VITE_API_PROXY}/groups` for future single-gateway routing).

## Status

Track E **E1** (worker + crypto + client wiring) — implemented, not yet deployed. Group UX (create/
invite/join/split/settle) lands in E2–E5. Behind the `sync` entitlement (dark) until then.
