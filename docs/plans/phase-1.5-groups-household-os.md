# Phase 1.5 — Groups & Household OS (Master Plan)

> **Status:** In progress. Approved 2026-06-26.
> **Track 1 (IOU pairwise ledger): ✅ complete** (2026-06-27). **Track A (API Proxy worker): ✅ deployed**
> → `penny-api-proxy.hesh.workers.dev`. **Track B (client crypto additions): ✅ complete** (2026-07-01) —
> ECDSA/ECDH P-256 device keypairs (`engine.ts` + `identityKeys.ts`, lazy at claim), new encrypted stores
> `device_keys`/`group_keys`/`sync_cursor` (Dexie v8, in `BACKUP_STORES`), and non-destructive
> `mergeBundle()` (LWW on `updatedAt`, upsert-only). **Wrapping keypair = ECDH P-256.**
> **Track C (Auth/Identity worker + claim flow): ✅ complete** (2026-07-01) — new `workers/auth/` worker
> (D1 `users` + `devices`; `/username/check`, `/register`, `/challenge`, signed `/whoami` + `/device`;
> nonce||method||path||bodyHash signed-request auth), client `src/core/identity/` (`signedFetch` + `claim`),
> `AUTH_BASE`, `Profile.deviceId`, and a **`sync` entitlement dark by default**. **Model B: server stores
> `users`+`devices` only — no `user_blobs`/R2, no server recover endpoint.** Auth foundation only (QR/ECDH
> pairing UX deferred).
> **Track D (Automatic backup + multi-device sync): ✅ complete** (2026-07-01) — Model B to the user's
> **own cloud**: a provider abstraction (`src/core/sync/providers/` — Google Drive live on web; iCloud
> **code-complete but dormant** until native), an on-device **OPFS daily backup** floor when no cloud is
> chosen, a `backupEngine` (debounced push on change + periodic pull + `mergeBundle`), `openBundleWithDmk`,
> `SyncProvider`/`useBackupStatus`, and a **Backup destination chooser** + status UI. **Whole-blob;
> pull-merge-before-push + LWW.** Gated by the free `cloud_backup` entitlement (no claim required).
> **Track E (Groups & Household OS): 🚧 in progress — E1 ✅** (groups worker + group crypto + client wiring +
> Dexie v9); the last feature track. Detailed sub-phase plan (E1→E5) + **Stage F closeout** in
> [`phase-1.5-track-E-groups.md`](phase-1.5-track-E-groups.md). **Next:** E2 (create/invite/join/membership).
> Per-track status in [`docs/MILESTONES.md`](../MILESTONES.md) / [`docs/ROADMAP.md`](../ROADMAP.md).

## Context

Penny is a privacy-first, local-first, zero-backend PWA. Phase 1.5 is the first time it
gains a backend and multi-user sharing — so the entire design question is: _what is the
minimum server, minimum PII, and minimum cost that still delivers a lovable shared
experience without breaking the privacy promise or the "free" promise?_

Two constraints shape everything:

1. **The app must stay fully usable with no backend.** Groups/sync are an additive,
   opt-in layer. Nothing built here may make the offline single-user app worse or gated.
2. **Free + privacy-first is non-negotiable.** No per-user recurring cost; minimum PII.

This plan supersedes parts of `docs/ROADMAP.md` (which still specifies phone+OTP) — see
"Decisions that changed the roadmap" below.

---

## Decisions locked this session

**Auth / identity — drop Phone + OTP.**

- Phone OTP costs money (SMS gateways) and is maximal PII — both contradict the product.
- Identity = on-device keypair + existing `Profile.userId` (UUID, already generated at
  onboarding) + a self-chosen `username`.
- **Username is optional in Phase 1** (as built — auto-suggested from display name, live
  format validation, copy = "your sharing handle; we'll confirm it's free when you set up
  sharing"). Uniqueness is **deferred to claim time** (no server in Phase 1). Rationale:
  the permanent anchor is `userId` (UUID) — nothing keys off the username string, so claim is
  a pure relabel; making it optional shrinks the local-vs-server collision surface and adds no
  onboarding friction. Username = public invite/sharing handle; it can **never decrypt
  anything**.

**Recovery / multi-device — Model B (user-owned Drive/iCloud only; we store nothing personal).**

> **Superseded (2026-06-27):** the original Model A below (server-blind blob in our R2 as the
> primary copy) is replaced by **Model B**. Canonical: [`docs/BACKEND_STRATEGY.md`](../BACKEND_STRATEGY.md) §5.

- **Personal backup/recovery lives in the user's own Google Drive/iCloud only.** The encrypted
  `.penny` blob (byte-identical to the v2 export — carries all data + receipts + the device
  keypair + every Group Key) is uploaded to the user's own cloud on a schedule. **Our servers
  store nothing personal.**
- **Multi-device (still have a device):** QR device-pairing — old device wraps the DMK to
  the new device over an ECDH channel. No passphrase re-entry, no PII.
- **Recover from nothing (app deleted, reinstalled months later):** sign into the user's own
  Drive/iCloud → pull the encrypted blob → enter passphrase → DMK + device private key +
  **every Group Key** restored. The server's tiny membership table says which groups the user
  is in; the app re-pulls and decrypts each group's events. **No re-invite, no re-handshake,
  no rejoin** — groups reappear (server holds membership; Drive holds the keys/history — the
  WhatsApp split). Recovery is therefore the user's responsibility (Drive must have been
  enabled); this is the deliberate Model B cost/privacy trade vs Model A's automatic safety net.
- **Optional hybrid (not the default):** the server-blind blob remains available as an
  **entitlement-gated convenience** for users who won't enable Drive — off by default, opt-in.

**Groups.**

- Per-group AES-256 Group Key; user can be in multiple groups simultaneously; each group's
  data fully independent. Key exchange at invite time via members' public keys.
- **Invites:** one-time-use by default, with a creator-set TTL and an optional `max_uses`
  count (so a family can batch without regenerating), revocable anytime. Delivered as
  link/QR (shared over WhatsApp). Server relays ciphertext only.
- Key **rotation** on member-leave handled via a `group_key_grants` table so long-offline
  members catch up without rejoining.

**Hero features (what makes it lovable).**

- **Be the privacy-first Splitwise** — native pairwise ledger now, N-party split engine in
  Track E. Lead positioning with this.
- **Per-item share = group selector** (not a boolean, not family-only): default Personal;
  explicitly push an expense/goal/IOU to one or more groups. Item in "Trip" is invisible to
  "Family." This is the multi-group privacy boundary.
- **Settle-up stays out of the money flow.** Penny stores **no UPI VPA** and generates **no
  payee QR** (a trust ask that cuts against the privacy promise and would likely go unused).
  The actual payment happens in whatever UPI app the user already trusts. In Penny, settling
  is **a recorded ledger entry**, and settling a _received_ IOU **optionally creates a linked
  income/transfer entry** in the expenses module (the reverse of expense-seeding) so account
  balances stay honest.

**Backend platform:** Cloudflare Workers + D1 (metadata) + R2 (ciphertext blobs, no egress
fees) + KV (ephemeral cache/rate-limits). API Proxy worker ships first.

_Why Workers, not a Node server we build & deploy ourselves:_

- _Pros of our own Node server:_ full Node runtime (any npm lib, long-running jobs,
  websockets, no CPU-time cap); no vendor lock-in; trivial local dev parity; familiar model.
- _Cons:_ **always-on → bills even at zero traffic** (kills the free promise); we own ops
  (provisioning, autoscaling, LB, OS/security patching, monitoring, uptime); **single-region**
  unless we pay for multi-region (worse India latency vs Cloudflare edge); must stand up our
  own Redis/rate-limiter/secrets (Cloudflare gives these free); larger attack surface.
- _Verdict:_ Phase 1.5's workload is short request/response + ciphertext relay + caching —
  a perfect isolate fit, so Workers win on cost+ops. Not all-or-nothing: if a future feature
  truly needs Node (heavy compute, realtime), add a targeted Node service then; it coexists
  with the Workers. (Supabase already rejected as heavier new-vendor.)
- _AI workloads (Chip + auto-categorization, Phase 2) fit Workers well — arguably better than
  Node:_ these are **I/O-bound** (waiting on Anthropic), and Workers bill **CPU time, not
  wall-clock**, so the long LLM latency is uncharged idle wait while our logic (PII-strip +
  build context + forward) is ~2 ms. Native **SSE streaming** suits Chip's token-by-token
  responses; **Cloudflare AI Gateway** in front of Anthropic adds prompt caching (dedup
  identical merchant→category prompts → fewer token calls), per-user rate-limiting, and
  observability; **Queues** handle batch categorization (e.g. 500-txn import). This routes
  through the existing single choke point `src/core/ai-safety/anthropicClient.ts` /
  `buildUserContext.ts` via an **AI proxy Worker** holding the key server-side. The real cost
  is **Anthropic tokens, not the Worker** — minimized via the planned local rules engine
  (80–90% offline over time), amount-band/merchant-only payloads, prompt caching, and a
  rate-limited shared key / bring-your-own-key.

### Decisions that changed the roadmap

**Reconciled (2026-07-01).** `docs/ROADMAP.md` no longer says phone+OTP / `phone_hash`; its
Auth/Backend sections now describe keypair challenge/response + **optional** username + **Model B**
(user-owned Drive/iCloud backup, server stores nothing personal). Canonical backend decisions live
in [`docs/BACKEND_STRATEGY.md`](../BACKEND_STRATEGY.md).

---

## Track sequencing

| Track                                          | Scope                                                                                       | Backend? | Why this order                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| **1. IOU person-ledger redesign**              | Pairwise running ledger + expense-seeding + partial settle + realistic multi-year seed      | **No**   | Ships value immediately; the offline foundation Groups later syncs. De-risks everything.   |
| **A. API Proxy worker**                        | Stateless market/vehicle proxy + tiered cache + CORS                                        | Yes      | Lowest risk; fixes CORS; collapses external calls N→1; establishes worker deploy template. |
| **B. Client crypto additions**                 | Keypairs, `device_keys` + `group_keys` stores, non-destructive merge restore                | No       | Server-independent; fully testable locally.                                                |
| **C. Auth/Identity worker + claim flow**       | D1 users/devices, challenge/response, recover endpoint, R2 blob PUT/GET                     | Yes      | Single-user multi-device + recover-from-nothing.                                           |
| **D. Sync layer**                              | `src/core/sync/` cursor + personal-blob optimistic sync over the activity log               | Yes      | Keeps the server blob current; recovery always up-to-date.                                 |
| **E. Groups worker + split engine + group UX** | groups/members/invites/key-grants/events, N-party split, leave + rotation, context switcher | Yes      | The full Household OS, built on B–D.                                                       |

---

## Track 1 — IOU Pairwise Ledger Redesign (DETAILED — build first)

### Why

Today's IOU is a flat list of one-off lent/borrowed entries with the **person's name stuffed
into a free-text `description`** — no person entity, no per-person balance, all-or-nothing
settle, zero expense linkage (`src/core/db/types/index.ts` ~481, `src/features/iou/`).
A **per-person ledger IS the Splitwise model constrained to 2 parties.** Phase 1 ships
pairwise ledgers (you + one person; many people, each its own ledger; simple/even splits);
the N-party split engine layers on in Track E with no rewrite (hooks already in the model).

### Critical implementation fact

Encrypted stores **cannot** use a Dexie `.upgrade()` callback (it runs pre-unlock, sees only
`{id, iv, ciphertext}`). Every prior data migration in this repo runs as a **post-unlock,
`localStorage`-flagged backfill in a hook** (see the category/merchant backfill in
`src/features/expenses/useExpenses.ts`). The IOU migration must follow that exact pattern.

### Data model — `src/core/db/types/index.ts`

- New `Person`: `{ id, name, phone?, notes?, linkedMemberId?, isArchived?, ... }`.
  `linkedMemberId` is the **future group-sync hook** (null in Phase 1.5). **No `upiVpa`** —
  we deliberately do not store payment handles.
- New `LedgerEntry`: `{ id, personId, kind: 'lent'|'borrowed'|'settlement', amount (always
positive), date, dueDate?, description?, notes?, settleDirection?: 'they_paid_you'|
'you_paid_them', origin: 'manual'|'expense'|'migration', linkedTxnId?, remoteId?, ... }`.
  **As built:** a single bidirectional `linkedTxnId` (not the originally-planned separate
  `sourceExpenseId` + `linkedIncomeId`) links the entry to its real-money transaction — the
  seeding expense for expense-origin entries, or the optional income/transfer created when
  settling a received IOU; `remoteId` is the future group-sync hook.
- Keep `PersonalIou` for migration/restore typing. **Partial settlement is a first-class
  `settlement` entry — no `isSettled` boolean.** A person is "settled" when derived net ≈ 0.

### Schema / repos / registry

- `src/core/db/schema.ts`: add `this.version(7).stores({ persons: 'id', ledger_entries: 'id' })`.
  Keep `personal_ious` declared (don't drop for one release). No `.upgrade()`.
- `src/core/db/repositories.ts`: add `personsRepo`, `ledgerEntriesRepo` via `EncryptedRepository`.
- `src/core/db/entityRegistry.ts`: register `person` + `ledgerEntry` for Undo/restore.
- `src/core/backup/backupManager.ts`: add `'persons'`, `'ledger_entries'` to `BACKUP_STORES`
  (keep `'personal_ious'` so legacy survives a round-trip).

### Pure core (new, unit-testable — no React/repo)

- `src/core/iou/ledger.ts` — `netBalance`, `balanceByPerson`, `totalOwedToYou`,
  `totalYouOwe`, `overdueEntries`. Sign convention: lent `+`, borrowed `−`, settlement per
  `settleDirection`. Allow over-settlement (sign flip, never clamp); treat `|net| < ₹1` as
  settled for labels only; store exact amounts.
- `src/core/iou/aiLabels.ts` — `assignOrdinalLabels(persons)` (session-scoped `id → "Person N"`),
  the single enforcement point for the `iou.md` rule that names/phone never reach AI raw.
- `src/core/iou/expenseLink.ts` — pure reconcile: given old entries + new intent, return
  `{toPut, toDelete}` (keeps expense↔IOU cascade testable). Same helper handles the
  settlement→income linkage (reverse direction).

### Hook — rewrite `src/features/iou/useIou.ts`

- Load `persons` + `ledgerEntries` via `useLoggedRepository` (Timeline + Undo for free).
- Memoized derived state from `core/iou/ledger.ts`: `personsWithBalance`, totals, overdue.
- Compound mutations: `addEntry`, `settle(personId, amount, direction, note?, {createIncome?})`
  (partial/full; optionally creates a linked income/transfer in expenses),
  `getOrCreatePerson(name)` (dedupe case-insensitive), `removePerson` (soft-archive if entries
  exist, hard-delete with snapshot only when entry-free).
- **Migration backfill** here, flagged `penny_iou_v2`, mirroring the `useExpenses` pattern:
  read legacy `personal_ious`; parse a person name from `description` (leading token, else an
  "Unmatched" bucket — keep full original text on the entry); create one `LedgerEntry`
  (`origin: 'migration'`); if `isSettled`, append a matching `settlement` entry dated
  `settledAt` so net = 0. Idempotent; don't delete legacy rows in v7.

### Expense ↔ IOU linkage — `src/features/expenses/transactions/ExpenseForm.tsx` + `useExpenses.ts`

- Optional collapsible "Split / IOU" section: `PersonPicker` + amount + mode (_lent to /
  borrowed from / split with / paid on behalf of_). Centered modal, no bottom sheet.
- On create: seed `LedgerEntry`(s) with `linkedTxnId` (the expense id) + `origin:'expense'`.
- On edit: reconcile via `expenseLink.ts` (upsert/delete to match new intent).
- On delete: cascade-delete seeded entries; extend the existing delete snapshot to include
  them so a single Undo restores expense + entries atomically.
- Mode→kind: lent/paid-on-behalf → `lent` full; borrowed → `borrowed` full; split (2-way even)
  → `lent` half.

### Settle-up — `SettleUpModal.tsx` (no payment integration)

- Amount prefilled to net (editable for partial) + direction + optional note → creates a
  `settlement` entry. **No VPA, no QR, no payment provider.**
- If settling a _received_ IOU (they paid you), offer a checkbox "Also record this as income"
  → creates a linked income (or transfer) in the expenses module via the shared linkage
  helper, stamping `linkedTxnId`. Editing/deleting the settlement reconciles that entry too.

### UI — `src/features/iou/` (reuse existing component library; no bottom sheets)

- `PersonListView.tsx` — one row per person with derived net ("Rohan owes you ₹600" /
  "You owe Asha ₹250" / "Settled up"); overdue Badge; ageing Banner; privacy `••••` masking;
  sort owed-to-you first. (Replaces entry-list paradigm of `IouListView.tsx`.)
- `PersonLedgerView.tsx` — per-person running ledger: net + Settle-up + Add-entry, then
  reverse-chron entries (expense-origin rows badged/linked).
- `PersonPicker.tsx` — type-ahead over persons + "Create '<typed>'" (shared with ExpenseForm).
- `EntryForm.tsx` — person + direction + amount + date + dueDate + notes (replaces `IouForm.tsx`).
- `PersonForm.tsx` — edit name / phone / notes.
- `IouPage.tsx` — 2-level: person list → drill into ledger (nested route or centered modal);
  header totals switch to derived `totalOwedToYou` / `totalYouOwe`.
- `src/features/expenses/iou/IouSlice.tsx` — re-point to `PersonListView` + derived totals.

### Closing deliverable — expanded realistic multi-year seed

Rebuild/extend `src/core/db/seedDemoData.ts` into a **realistic salaried persona, 2017→today**,
exercising every Phase 1 + Pre-1.5 + Track 1 surface, to shake out bugs and pressure-test UX:

- **Career arc:** currently in 3rd company; ~3.5 yrs at company 1 (annual hike each **April**),
  ~8 yrs at company 2 (annual hike each **July**), now in company 3 — salary credits reflecting
  each role/CTC + hikes, realistic deductions (EPF, tax).
- **Expenses/income/transfers since 2017:** recurring (rent, bills, EMIs, subscriptions, SIPs),
  seasonal/festive spikes, salary credits, transfers across multiple accounts (bank/cash/credit/
  wallet), category spread matching the new category system.
- **IOU:** multiple lenders/borrowers (friends/family), pairwise ledgers with partial
  settlements and some settled history; a couple seeded from expenses.
- **Investments/insurance/loans/goals/tax** populated consistently so health score, cash-flow,
  net worth, and tax screens render with non-trivial multi-year data.
- Keep amounts/dates plausible (en-IN, ₹); deterministic so demos/tests are reproducible.

### Track 1 step order

1. Types → 2. Schema v7 → 3. Repos → 4. entityRegistry → 5. Pure core (`ledger`/`aiLabels`/
   `expenseLink`) → 6. `useIou.ts` rewrite + backfill → 7. backup + clearAll → 8. UI → 9. Expense
   linkage + settle→income → 10. routing → 11. **expanded realistic seed**.

### Track 1 risks

- Encrypted-store migration must be post-unlock backfill (not `.upgrade()`) — biggest correctness risk.
- Expense edit/delete cascade + atomic Undo of expense+entries; settlement→income reconcile.
- Lossy name parse on migration → keep original text + "Unmatched" bucket + user re-assign.
- Person delete with history → soft-archive. INR-only. Honor privacy masking on every amount.

---

## Track A — API Proxy Worker (DETAILED — ✅ shipped & deployed)

> **As built (2026-07-01)** → `penny-api-proxy.hesh.workers.dev` (`workers/api-proxy/`). The
> endpoint scheme below reflects the deployed worker, which differs from this section's original
> design (per-symbol routes `/market/:symbol` etc.). See also [`docs/MILESTONES.md`](../MILESTONES.md)
> → Track A.

**Purpose.** Stateless proxy + tiered cache for external APIs (Yahoo Finance, MFAPI NAV, NPS,
IPO/investorgain, vahandetails vehicle lookups); fixes CORS; **collapses N user calls into 1
upstream call** via a shared cache.

**Endpoints (as built).**

- **Prefix passthrough** — `GET /yf/*`, `/mfapi/*`, `/nps/*`, `/ig/*`: transparent proxy of the
  known upstreams, KV-cached with TTLs mirroring the client (Yahoo 15 min, MF NAV 24 h). The
  client swaps only the base URL — no per-endpoint route on the worker.
- **`GET /market`** — a **global, Cron-refreshed market snapshot** (ticker strip), edge-cached
  (`caches.default`) + KV-backed. **New decision (not in the original design):** global market
  data is served from one shared snapshot, not a per-user/per-symbol proxy call — decoupling
  upstream volume from user count. Client fetches it once via `MARKET_SNAPSHOT`.
- **`GET /vehicle/:regno`** — semantic endpoint with a **permanent D1 cache** + smart Vahan queue
  (below). `?refresh=1` forces a rate-limited bypass.
- **`GET /health`** — liveness.

**Tiered cache (the core of the scale story).**

- **KV with TTL** for volatile passthrough data (market 15 min, MF NAV 24 h).
- **D1 persistent** for effectively-immutable data: **vehicle details keyed by registration
  number, cached permanently** (make/model/registration date don't change). First lookup of a
  reg number = one upstream call; everyone else — _and the same user deleting and re-adding_ —
  is a **cache hit, zero upstream calls.** (Personal blobs use R2 in later tracks; vehicle cache is D1.)
- **Force-refresh** (`?refresh=1`, behind an explicit "Refresh" button): bypasses cache, but for
  Vahan is confined to a working window and a **~900-call/day budget**. On a miss outside the
  budget/window (or on failure) the reg is **queued (deduped), cached served, refreshed in the
  background**; a **Cron (06:00 / 08:30 / 11:30 IST)** drains the queue and refreshes the market
  snapshot. Net Vahan upstream calls ≈ globally-new reg numbers per day — **independent of user
  count** (survives the ~1000/day free limit at scale).
- **Per-IP rate limits** via KV.

**Client wiring (as built).** Base-URL swap via `src/core/net/apiBase.ts` reading `VITE_API_PROXY`;
market strip reads `MARKET_SNAPSHOT`. **Unset = today's direct behavior** (app stays fully usable
with no backend). No app-logic change.

**Deploy.** Wrangler, `dev`/`staging`/`prod` envs; **deployed** with KV `CACHE` + D1 `penny_proxy`
(APAC), Cron `*/15`. This worker is the **deploy template for B–E**. Auth model reconciled off
phone+OTP in `docs/ROADMAP.md` here. **Deferred (post-close):** merchant-dictionary endpoint,
edge Cache API layering.

---

## Track B — Client Crypto Additions (DETAILED — no server dependency)

- `src/core/crypto/identityKeys.ts`: generate an **ECDSA P-256** signing keypair + an
  **RSA-OAEP-2048 (or ECDH P-256)** wrapping keypair. Generate **lazily at claim** (not at
  onboarding) so non-sync users pay nothing.
- New encrypted stores (Dexie v-next, added to `BACKUP_STORES` so they ride recovery):
  `device_keys {id, kind: 'sign'|'wrap', jwk}`, `group_keys {id: groupId, keyEpoch, jwk}`,
  `sync_cursor {id, scope, version|seq}`.
- **Non-destructive `mergeBundle()`** in `backupManager.ts`: upsert + last-write-wins on
  `updatedAt` for all sync/recovery pulls; keep the existing destructive `importBackup`
  (`clear()`+`bulkPut`) only for explicit user-initiated file restore.
- Fully unit-testable offline (keygen, wrap/unwrap round-trip, merge semantics).

---

## Track C — Auth/Identity Worker + Claim Flow (DETAILED — ✅ as built)

> **As built (2026-07-01), reconciled to Model B.** The server stores **identity metadata only** —
> `users` + `devices`. There is **no `user_blobs` table, no R2 personal blob, and no server
> `recover?username→blob` endpoint** (the original Model-A design below is superseded). Personal
> backup/recovery is the user's own Drive/iCloud (Track B `mergeBundle` + the Drive path); the server
> only records group membership so groups reappear on recovery (Track E). See
> [`docs/BACKEND_STRATEGY.md`](../BACKEND_STRATEGY.md) §5.

**Worker** `workers/auth/` (built from the Track A template — Wrangler `dev`/`staging`/`prod`, KV, D1).

**D1** (`migrations/0001_init.sql`): `users(user_id PK, username UNIQUE nullable, signing_key,
kdf_salt?, created_at, updated_at)`, `devices(device_id PK, user_id, signing_key, wrapping_key,
label, created_at, revoked_at)`. **KV:** `challenge:{nonce}` (60s TTL, single-use), `rl:*` counters.

**Endpoints.** `POST /username/check` → `{available}`; `POST /register {user_id, username?,
signing_key, device_id, device_signing_key, device_wrapping_key, kdf_salt?}` (first-claim-wins via
UNIQUE; idempotent per `user_id`); `GET /challenge?user_id`; **signed** `GET /whoami` and `POST
/device` (add a device). The router tolerates an optional `/auth` path prefix.

**Device auth without PII (the crux).** A signed request carries `x-penny-{user,device,nonce,sig}`;
the worker consumes the single-use nonce from KV, loads the device's public key, and verifies an
ECDSA P-256 signature over `nonce\nMETHOD\npath\nsha256(body)`. No passwords/passphrase ever reach
the server. Anti-brute-force: per-IP + per-username KV fixed-window limits, uniform responses.

**Client `src/core/identity/`.** `signedFetch(path, init)` — the single choke point for
authenticated worker calls (challenge → sign → attach headers), reused by Tracks D/E. `claim.ts` —
`ensureIdentityKeys()` (Track B) → `username/check` → `register` (with `Profile.userId` + a new
`device_id`) → persist `username`/`deviceId` on the profile → confirm via signed `/whoami`. Base URL
`AUTH_BASE` (`VITE_AUTH_PROXY`, falling back to `${VITE_API_PROXY}/auth`). **Zero data migration**
(userId was the anchor since onboarding). Gated behind the new **`'sync'` entitlement (dark by
default** — readiness-gated on Track D, flip on for beta/canary). Claim UI is a gated
"Account & Sync" section in `ProfilePage`.

**Deferred (later step/track):** the full QR + ECDH DMK-handoff device-pairing **UX** (the
`deriveSharedWrappingKey` primitive already exists from Track B); the optional entitlement-gated
server-blind hybrid blob.

---

## Track D — Automatic Backup + Multi-Device Sync (DETAILED — ✅ as built, Model B)

> **As built (2026-07-01), reconciled to Model B.** No server `PUT /blob`/`If-Match`/409 — the blob
> lives in the user's **own cloud**; conflict resolution is Track B `mergeBundle` (LWW). The original
> server-sync design below is superseded.

- **Provider abstraction** `src/core/sync/providers/` — a `CloudProvider` interface (`isAvailable`,
  `ensureConnected`, `remoteTag`, `pull`, `push`). `googleDriveProvider` (live on web; silent-token +
  quota detection + `headRevisionId` change tag), `icloudProvider` (**code-complete but dormant** —
  `isAvailable()` false until the Capacitor native shell provides the bridge), and `localBackup` (OPFS
  daily on-device snapshots — the floor when no cloud target is chosen).
- **`backupEngine`** (`src/core/sync/`) — `sync_cursor`-backed (`'personal-blob'`; `remoteTag`/
  `pushedAt`/`lastBackupAt`). On debounced change (activity-log `subscribeActivity`) + a daily timer +
  periodic/foreground/online: cloud target → `remoteTag` diff ⇒ `pull` → `openBundleWithDmk` →
  `mergeBundle`; dirty or daily-due ⇒ `exportBackup` → `push`. Local/none → daily OPFS snapshot. Pure
  branching in `decide.ts`. `SyncProvider` (mounted in the unlocked `AppShell`) starts/stops it and
  exposes `useBackupStatus`.
- **Concurrency:** whole-blob; **pull-merge-before-push + LWW** (trade-offs + alternatives — etag CAS,
  event log — recorded in the approved plan file). **Gating:** free `cloud_backup` entitlement; the
  on-device daily backup is always on; account claim (Track C) is **not** required for personal sync.
- **UI:** a Backup destination chooser (This device · Drive · iCloud[disabled off-native]) + status
  (backed-up time / syncing / offline / quota-full / reconnect) + "Back up now", with benefit copy.
- **Deferred:** the native shell that activates iCloud; encrypted delta; etag CAS; edge Cache API.

---

## Track E — Groups Worker + Split Engine + Group UX (DETAILED)

> **📝 Detailed, approved (not started) plan:** [`phase-1.5-track-E-groups.md`](phase-1.5-track-E-groups.md)
> — the last feature track, sequenced as sub-phases **E1→E5** (worker+crypto → create/invite/join/membership
> → N-party split engine + shared-expense composer → group sync + context switcher + dashboards + settle/close
> → trip↔group linkage + per-item share + cash-negative guard + seed fix), followed by **Stage F — the
> Phase 1.5 closeout** (full end-to-end testing incl. real backup, UI/design-consistency polish, iCloud native
> activation, and a planning conversation on further additions before Phase 1.5 is closed). The section below
> is the original outline; the linked doc supersedes it.

**D1:** `groups(group_id PK, type, enc_name, owner_id, key_epoch, ...)`,
`group_members(group_id, user_id, role, joined_at, left_at, PK(group_id,user_id))`,
`invites(token_hash PK, group_id, role, expires_at, max_uses, uses, revoked, created_by)`,
`group_key_grants(group_id, user_id, key_epoch, wrapped_key, PK(group_id,user_id,key_epoch))`,
`group_events(group_id, seq, event_id, author_id, key_epoch, r2_key, lamport, PK(group_id,seq))`.
**R2:** `gevent/{group_id}/{seq}` = `AES-GCM(GroupKey_epoch, eventJson)`.

**Endpoints.** create group; create/redeem/revoke invite; membership CRUD; key-grant relay
(store ciphertext grants); append/fetch `group_events`. All authorized by signed challenge +
membership check.

**Key exchange & rotation.** Invite carries only `SHA-256(secret)` + TTL + max*uses; the
**raw secret lives only in the link/QR**; Group Key is \_not* in the invite. On redeem the
invitee uploads its public key; any admin then wraps the current Group Key to that public key
into `group_key_grants`. On member-leave: bump `key_epoch`, re-wrap the new key to each
remaining member (fresh grants) — a long-offline member fetches all grants up to the latest
epoch and **catches up with no rejoin**.

**Split engine (the Splitwise N-party layer).** Generalizes Track 1's pairwise ledger: a
**shared expense → shares (even/exact/percent) → who-paid → derived balances → multi-party
settle**. Built on the same model — `Person.linkedMemberId` links a local person to a real
member; `LedgerEntry`/event gains group context. No rewrite of Track 1.

**Group UX.** Home **context switcher** (Personal ↔ each group; no 6th nav tab), per-group
dashboards (merged net worth where enabled, joint goals, shared expenses), per-group activity
feed (reuse Timeline), **per-item share selector** (push expense/goal/IOU to chosen group(s)),
leave flow (settlement prompt → frozen read-only archive → server revoke + key rotation).

**Conflict model.** Append-only encrypted event ledger; server-assigned `seq` total order +
client `lamport` causal order; per-entity **LWW on `updatedAt`** with retained diffs + delete
tombstones (reuses the Track-4 activity log). Offline-friendly and undoable.

---

## Rules-based categorization engine (NO AI) + text/voice quick-add vision

A deterministic engine is the **primary** auto-categorization path; AI (Chip) is only a
fallback. It is free, instant, offline, private, and predictable. Mostly **on-device**; the
backend only keeps a shared dictionary fresh (no user data ever leaves the device).

**Engine (`src/core/categorization/`, on-device):**

1. `normalize.ts` — clean noisy UPI/bank descriptions (strip refs/prefixes/txn IDs, lowercase,
   tokenize). The hard, foundational step.
2. `merchantDictionary.ts` — curated, India-tuned keyword/merchant → category map, **bundled**
   so it works day one offline (Swiggy/Zomato→Food, Ola/Uber/IRCTC→Transport, Blinkit/
   BigBasket→Groceries, Jio/Airtel→Bills, Netflix→Subscriptions, …).
3. `learn.ts` — reuse the existing **`merchant_memory`** store: on user override, persist
   `{merchant → category}`. Over time covers nearly all of the user's recurring merchants
   (this is the "80–90% offline" with zero AI).
4. `rulesEngine.ts` — match order: exact memory → known merchant → fuzzy/regex → heuristics
   (recurring same-amount/payee → subscription/EMI/rent; monthly large employer credit →
   Salary; round amount to a known person → transfer/IOU). Emits a **confidence**; high →
   auto-apply silently, medium → one-tap suggestion, low → leave uncategorized.

**Backend role (no AI):** a Worker endpoint serves a **curated, versioned merchant→category
dictionary**, KV-cached; the device downloads + refreshes periodically. New merchants are
added centrally and pushed to all users. The dictionary is a public asset — no transaction,
amount, or identity is ever uploaded. (Small add-on to Track A.)

**Text/voice quick-add (future, built on the same engine, mostly no AI):**

- Voice → text via Web Speech API (on-device, free in the PWA).
- `src/core/nlp/parseTransaction.ts` — deterministic parse of amount (`₹500` / number-words),
  date (`lib/date.ts`: "yesterday"/"last monday"), type ("spent/paid"→expense,
  "received/salary"→income, "lent/gave/borrowed"→IOU, "transferred"→transfer), and
  category/merchant via the dictionary. Handles ~70–85% of natural entries offline; **AI is
  the fallback** only for ambiguous phrasing.

Independent of groups — the on-device engine + bundled dictionary can ship near-term with no
backend; the Worker-served dictionary refresh is the only backend piece.

---

## Shipping & Release plan

- **Vehicle:** installable **PWA on Cloudflare Pages** (Phase 1/1.5). Native wrappers + app
  store submission = Phase 2.
- **Environments:** Pages prod + per-PR preview deploys; Workers via **Wrangler** with
  `dev`/`staging`/`prod` envs; secrets via `wrangler secret`; D1 migrations versioned & applied
  per env.
- **Pipeline:** branch → PR → 3 CI gates (incl. `tests/pii-gate`) → merge `main` → Pages
  auto-deploy + CI `wrangler deploy` for workers.
- **Feature gating:** sync & groups ship **dark behind the `sync` entitlement** → enable via
  opt-in beta / % canary with no separate release.
- **PWA updates:** service-worker update flow + "update available" prompt; data migrations are
  versioned idempotent **post-unlock backfills** (existing pattern).
- **Rollback:** Pages keeps deployment history (instant rollback); Workers versioned
  (`wrangler rollback`); D1 migrations forward-only → write reversible/idempotent.
- **Observability:** Cloudflare analytics + Worker logs, **never logging PII** (honor the
  `no-console` PII rule).

---

## Scale economics & external-API call reduction (millions of users)

- **Proxy collapses N→1:** a given market symbol / MF scheme / vehicle reg is fetched **once**
  upstream and served to all users from cache — upstream volume is decoupled from user count.
- **Tiered cache:** KV TTL for volatile (market 15 m, NAV 24 h); **D1/R2 persistent** for
  static (vehicle details by reg number, cached permanently → re-adds are cache hits, no call).
- **Vahan (1000/day, morning-only):** permanent cache + explicit-only, rate-limited
  force-refresh + morning Cron batch + queue-when-exhausted. Net upstream ≈ globally-new reg
  numbers/day.
- **Free-tier ceilings (first to hit):** Workers 100K req/day (paid ≈ $5/mo per 10M); KV
  100K reads/day; D1 row limits; R2 storage+ops but **no egress** (big win for blob pulls).
- **Reduce invocations:** debounced/delta sync (one sync vs many calls), edge Cache API,
  coalesced market fetches, sync only on meaningful change.
- **Honest framing:** at millions of users we exceed free tier — but cost is **usage-based,
  cheap, and linear; no re-platforming.** Free tier carries launch + early growth.

---

## Documentation to update (per project discipline)

- `docs/ROADMAP.md` — replace phone+OTP with the keypair/optional-username/**Model B** model
  (user-owned Drive/iCloud backup, server stores nothing personal); record IOU-first sequencing,
  group-key/recovery design, settle-up-without-payment decision.
- `docs/features/iou.md` — pairwise ledger, partial settle, expense-seeding, settle→income.
- `docs/SCHEMA.md` — `persons`, `ledger_entries` (Track 1); `device_keys`, `group_keys`,
  `sync_cursor` (later tracks).
- `docs/ARCHITECTURE.md` — new `src/core/iou/`, `src/core/sync/`, `src/core/identity/`,
  `src/core/crypto/identityKeys.ts`; new IOU components.
- `CLAUDE.md` milestone table; `.claude/commands/penny-standards.md` for any new rules.

---

## Verification

**Track 1 (offline, no backend):**

- Unit tests for `core/iou/ledger.ts` (sign convention, over-settlement, |net|<₹1, empty),
  `expenseLink.ts` (reconcile add/edit/delete + settlement→income).
- Migration test: seed legacy `personal_ious` (settled + unsettled) → run backfill → assert
  Person + LedgerEntry created, settled history reproduces net≈0, idempotent on re-run.
- `tests/pii-gate/piiGate.test.ts` passes; add a check that IOU→AI context uses ordinal labels
  only (never raw name/phone).
- Backup round-trip: export → import → persons/ledger intact.
- **Expanded seed** loads cleanly and renders non-trivial data across every screen (home,
  expenses, portfolio, goals, insurance, loans, IOU, tax, health score, cash-flow, timeline);
  use it to walk the app and log bugs/UX issues.
- Manual (`/run`): add person, lend, partial-settle, derived net; seed IOU from an expense,
  edit/delete the expense, confirm ledger reconciles + Undo restores both; settle a received
  IOU with "record as income" and confirm the linked entry + account balance.

**Backend tracks:** API Proxy — market/vehicle load via worker, CORS gone, cache hits, re-add
makes no upstream call, refresh is rate-limited. Auth — register, PUT/GET blob with signed
challenge, recover-from-nothing restores data + groups with no rejoin. Groups — create/invite
(one-time+TTL+max_uses)/join via QR, shared expense + N-party split syncs both ways, leave
triggers settlement + key rotation, departed member can't decrypt new events.
