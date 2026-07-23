# Penny — Roadmap & Architecture Decisions

This document records the product roadmap for Phase 1.5, 2, and 3, along with the key architectural decisions made for each phase. Decisions are recorded here so they don't need to be re-derived in future sessions.

**Last updated:** 2026-07-05 (Track E ✅ feature-complete + deployed (E1–E5 + tail); **Track F — Multi-Device, Sync & Recovery** F1–F3 done: phantom-claim fix, recovery hardening + restore-on-reinstall + account-start flow, passphrase reclaim (Ed25519). Auth worker needs redeploy + migration `0003`. Pending: Track E end-to-end verification + F4 device pairing + Stage F. Plans: `docs/plans/phase-1.5-track-E-groups.md` (groups) + `docs/plans/phase-1.5-track-F-multi-device-recovery.md` (recovery model))

> **Phase 1.5 detailed plan:** [`docs/plans/phase-1.5-groups-household-os.md`](plans/phase-1.5-groups-household-os.md);
> Track A detail: [`docs/plans/phase-1.5-track-A-api-proxy.md`](plans/phase-1.5-track-A-api-proxy.md).
> **Auth reconciled (Track A, 2026-06-27):** phone + OTP is **dropped**. Identity is an on-device
> keypair + an **optional** self-chosen `username` + the existing `Profile.userId`; **no phone, no
> OTP, no PII**.
> **Backup reconciled to Model B (2026-06-27, canonical [`docs/BACKEND_STRATEGY.md`](BACKEND_STRATEGY.md) §5):**
> personal backup/recovery lives in the **user's own Google Drive/iCloud only — our servers store
> nothing personal**; the server keeps only tiny identity + group-membership metadata and per-group
> ciphertext. This supersedes the earlier "server-blind personal blob in our R2" (Model A) wording;
> some Track C/D architecture sub-sections below may still show the older phrasing (the parent plan +
> BACKEND_STRATEGY are authoritative).

---

## Phase boundaries

| Phase            | Scope                                                                                                                                     | Status                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 1 (M0–M15) | Full financial life tracking, zero paid APIs, zero backend, local-first encrypted                                                         | ✅ Complete                                                                                                                                      |
| Pre-Phase 1.5    | Documentation overhaul, component extraction, onboarding v2, category overhaul, activity log, expense power features, tax-in-context      | ✅ Complete                                                                                                                                      |
| Phase 1.5        | Groups & Household OS — shared expenses, family vaults, joint goals, household net worth ([plan](plans/phase-1.5-groups-household-os.md)) | 🚧 In progress (Tracks 1 ✅, A ✅, B ✅, C ✅, D ✅, E ✅ deployed; **Track F** 🚧 F1–F3 ✅, F4 next). Remaining: Track E live verification + F4 + Stage F |
| Phase 2          | Chip real AI, AI auto-categorisation, export PDF/HTML, cloud sync, native apps, desktop layout                                            | ⏳ Future                                                                                                                                        |
| Phase 3          | Regional languages, crypto/Web3, international equities, advanced AI advisor                                                              | ⏳ Future                                                                                                                                        |

---

## Pre-Phase 1.5 — Track 2: Identity, Account & Security

Track 2 expanded from "collect DOB/employment/username" into a Phase-1 **Identity, Account & Security** program. Decisions finalized 2026-06-24.

### Encryption model — envelope encryption (supersedes passphrase-derived MK)

**Problem with the original model:** the Master Key was derived _directly_ from the passphrase, so the data key _was_ the passphrase. Changing the passphrase changed the MK → every record had to be re-encrypted (slow, corruption risk on interrupt). That's why passphrase change was never built.

**Decision:** adopt **envelope encryption**.

- One **random Data Master Key (DMK)** encrypts all data and never changes.
- The DMK is wrapped _independently_ by a passphrase-derived KEK and a PIN-derived KEK (and, later, biometric/device keys). Any factor unwraps the same DMK.
- **Change passphrase / PIN = re-wrap the DMK only** — instant, no data re-encryption. The old wrapping is deleted, so the old secret stops working.
- **Changing the passphrase requires the current passphrase** (defeats a found-unlocked-phone attacker who lacks it).
- DMK is random (leaks nothing about a chosen secret) and held **non-extractable** in memory only while unlocked. This is the standard privacy-first pattern (1Password, Apple, WhatsApp). No key escrow — passphrase lost = data lost.
- **Rejected** full re-encryption on passphrase change: true key-rotation buys ~nothing in a local-only app (a DMK leak implies device compromise, where plaintext is already exposed) and can't touch already-exported backups.
- **Migration:** the existing passphrase-derived MK simply _becomes_ the opaque DMK (data untouched); the passphrase-wrapping is added lazily when the passphrase is next available.

**In plain terms (the locker analogy).** Your data lives in a _locker_ opened by one _metal key_ — that key is the DMK, stamped at random in the factory (not cut from your passphrase). You don't carry the metal key; you drop a copy into two small _combo boxes_ on the wall — one combo is your passphrase, the other your PIN. Dial either combo → get the key → open the locker.

- **Old (passphrase-derived) model:** the passphrase was the metal key's _shape_. A new passphrase = a new key shape = a new lock on the locker = you must haul every item out and re-lock it (slow; half-done if interrupted = corrupted).
- **Envelope model:** the metal key never changes. Changing your passphrase just _re-sets the combo on one box_ — the locker and its contents are untouched. Instant. The old combo opens nothing.

**Why envelope, side by side:**

|                                         | Passphrase-derived MK (rejected) | Envelope / random DMK (chosen)                                                                                                                |
| --------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Change passphrase                       | Re-encrypt **every** record      | **Re-wrap** the key — data untouched                                                                                                          |
| Speed / risk                            | Slow; corruption if interrupted  | Instant; atomic                                                                                                                               |
| Add biometric later                     | Awkward                          | Just another wrapping slot                                                                                                                    |
| Cloud backup across a passphrase change | Breaks / re-keys                 | Works unchanged                                                                                                                               |
| Key rotation if DMK leaks               | Possible (re-encrypt)            | Not possible without re-encrypt — **but** a local DMK leak means the device is already compromised (plaintext exposed), so this buys ~nothing |
| Privacy posture                         | Key tied to a chosen secret      | Random key reveals nothing; non-extractable; no escrow                                                                                        |

Net: envelope wins on every axis that matters for a local-first app; the one thing it gives up (data-key rotation) is near-worthless here. This is also the industry-standard pattern (1Password, Apple Data Protection, WhatsApp backups).

### Identity — local now, server auth later

- Create `userId` + `username` + an **on-device keypair** locally at onboarding. **No backend / no SMS in Phase 1.**
- Phone + OTP server registration becomes an **optional Phase 1.5 upgrade** that "claims" the existing local identity (for cloud sync / groups) — same flow, **no data migration**.
- **Rejected:** phone+OTP from the start (forces the Auth Worker + paid SMS now, reframes the privacy promise); pure-local-no-identity (guarantees a 1.5 migration).

**Username uniqueness — the local-vs-server collision problem.** A locally chosen username is _not_ globally reserved (no backend in Phase 1), so a fully-local user and a server-registered user can both hold "rohan". Resolution:

- **`userId` (UUID) is the permanent anchor**, not the username. It's collision-free by construction and is what the keypair, future group memberships, IOU links, and the eventual server account all reference. **No local or shared data ever keys off the username string** — so the username can change with zero breakage.
- **The local username is explicitly _provisional_ — a wished-for label, not a reservation.** UI copy says so (e.g. "you'll confirm this when you set up sharing"). Username is **optional** in Phase 1, which shrinks the collision surface further.
- **At "claim your account" (Phase 1.5):** run the server availability check. Free → claim it (atomic, enforced by the D1 `username_idx` unique constraint, first-claim-wins for races). Taken → show suggestions and let the user pick another. Because nothing references the string, this is a painless relabel — no migration, no broken references.
- Optional nicety once the availability endpoint exists: a soft online check during onboarding to warn early; in pure-offline Phase 1 we simply set expectations in copy.

### Pulled into Phase 1 (from later phases)

| Feature                        | Was         | Now         | Notes                                                                                                                                                                                 |
| ------------------------------ | ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change Passphrase / Change PIN | "planned"   | **Phase 1** | Trivial under envelope (re-wrap). Settings buttons already exist as no-ops.                                                                                                           |
| Cloud backup                   | Phase 1.5/2 | **Phase 1** | Extends the existing `.penny` backup; web = user's own Google Drive (OAuth), we store nothing; iCloud waits for native. Routed through the entitlement gate so it can be gated later. |
| Re-auth to enter Open mode     | —           | **Phase 1** | PIN required to reveal real amounts.                                                                                                                                                  |

### Pricing readiness (no backend required)

Add an **`entitlement` gate that currently always returns pro/true**; route would-be-paid features (e.g. cloud backup) through it. Turning pricing on later = swap the entitlement source + add a "choose plan" step, with zero feature-code changes. Mechanism later: **store receipts** (native) / **offline-verifiable signed license tokens** (web) — neither requires us to store user data. Local `plan` / `licenseToken` concept stored on-device.

### Onboarding v2 flow

Splash → Privacy Promise (+ **Terms/Privacy consent**) → Privacy Demo → Meet Chip → **Simulated Dashboard (preview)** → **"Let us know you"** (one screen: full name [= display name], username, DOB, employment) → **Setup Credentials** (passphrase + 6-digit PIN) → [init encryption → write profile + identity → seed demo] → app. Personal info comes after the preview; credentials last so the DMK exists right before the write.

### Dropped

- **Biometric** — deferred until React Native (Phase 2); WebAuthn-PRF on PWA is patchy. Envelope leaves a wrapping slot to add it later.
- **Recovery key** — a shown-once unstored key is just another passphrase-equivalent; cloud backup is the real recovery path.
- **i18n** — English only.

### DOB privacy

Stored encrypted; only a **5-year age band** ever leaves to the AI (Phase 2). Two pure helpers: `deriveAge(dob)` (exact — FIRE/tax/EPF/NPS) and `deriveAgeBand(dob)` (band — AI). The band helper is the guardrail against wiring raw DOB into AI context. Downstream wiring in scope: FIRE age auto-fill, tax slab by age (senior 60+, super-senior 80+), EPF tab visibility + deductions by employment type, health benchmarks by employment type.

---

## Phase 1.5 — Groups & Household OS

### What it does

Enables multiple users to share financial data across households, families, and shared living arrangements. A user can be a member of multiple groups simultaneously.

### Group types

| Group type        | Description                  | Features                                                                                     |
| ----------------- | ---------------------------- | -------------------------------------------------------------------------------------------- |
| **Couple/Spouse** | Two-person household         | Shared expenses, joint goals, joint budgets, optional net worth visibility, merged dashboard |
| **Family**        | Multi-generational household | Shared expenses, joint goals, joint budgets, optional net worth visibility, merged dashboard |
| **Flatmates**     | Shared accommodation         | Shared expenses + splitting only                                                             |
| **Custom**        | User-defined                 | Owner configures which features are enabled                                                  |

**Key principle:** A user's personal data always stays personal. Only data explicitly posted to a group crosses the boundary. A user can be in multiple groups simultaneously — each group has completely independent data and encryption.

### Group dashboard & navigation

The **Home screen** gains a **context switcher** — a dropdown at the top that lets users switch between "Personal" and each group they belong to. No new bottom nav tab — the existing 5-tab structure is preserved.

When a group is selected:

- **Couple/Family:** Shows merged net worth (if both members enabled it), joint goals progress, shared expenses summary, joint budgets
- **Flatmates:** Shows shared expenses, who owes whom, shared bills
- Personal home screen remains unchanged when "Personal" is selected

### Group membership & roles

- **Owner** — created the group, can invite/remove members, can delete group
- **Admin** — can invite/remove members
- **Member** — can add shared expenses, view group data

### Leaving a group

1. User triggers "Leave group"
2. App shows **settlement summary**: "You are owed ₹2,340 by Rohan. You owe Priya ₹800. Settle up before leaving?"
3. After settlement (or user skips): local copy of group data is **frozen** (no more sync)
4. User retains **read-only archived** view of all group activity up to their leave date
5. User can export the archive as a local file or delete it entirely
6. Server is notified to revoke access — no future group data is sent to this user

### Personal IOU → Group linking

When a group is created with a named person that already exists in personal IOUs, Chip prompts: "Link Priya's existing IOUs to this group?" Migration is opt-in.

---

## Phase 1.5 — Backend Architecture

> **Scale + storage strategy:** [`docs/BACKEND_STRATEGY.md`](BACKEND_STRATEGY.md) — the 10M-user cost
> model, the global-data-via-CDN vs per-user-via-Worker rule, the Capacitor deployment model, and the
> proposal to keep **personal data/receipts in the user's own Drive/iCloud (store nothing on our
> servers)**. Read it before building Tracks C–E.

### Platform decision: Cloudflare Workers + D1 + KV

**Chosen over Supabase because:**

- Already using Cloudflare Pages for hosting — zero new vendor
- D1 (SQLite at edge) is sufficient for identity + group membership (not financial data)
- KV covers API response caching (market data, MF NAVs)
- Workers solve CORS + rate limiting for external APIs
- Edge-deployed globally — fast for Indian users
- Free tier: 100K Worker requests/day, 5M KV reads/day, D1 generous free tier

### Four Workers (deployed independently)

| Worker                | Ships in             | Purpose                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API Proxy**         | Phase 1.5 Track A ✅ | Passthrough + tiered cache for Yahoo / MFAPI / NPS / IPO, market Cron-snapshot, permanent D1 cache & morning queue for vahandetails — fixes CORS, collapses N→1 (`workers/api-proxy/`). **Deployed 2026-07-01** → `penny-api-proxy.hesh.workers.dev`                                                                                                                 |
| **Auth/Identity** ✅  | Phase 1.5 Track C + F | **Built (`workers/auth/`)** — keypair challenge/response signed-request auth, username availability + registration, `users`+`devices` public-key storage; client `signedFetch` + `claim`. **Track F adds passphrase recovery:** a per-account Ed25519 recovery verifier (public key + salt, migration `0003`) + `POST /recover/start`/`/recover/finish` for username+passphrase reclaim. **Personal backup/recovery is the user's own Drive/iCloud (Model B) — no personal blob on our server** (**no phone, no OTP**). Auth worker needs redeploy + migration `0003` for the recovery endpoints |
| **Groups** 🚧 deployed | Phase 1.5 Track E    | Group creation, member management, encrypted shared event ledger, key exchange + rotation. **E1–E5 ✅ + E5 tail ✅, workers deployed** — ciphertext-only relay (event bodies inline in D1, no R2), signed + membership/role-checked routes, per-epoch Group Key with ECDH-wrapped grants, split engine + sync engine + full group UX (switcher/dashboard/composer/settle/members), cash guard, share-with-group, vacation→group link, share-later, demo fixtures. `sync` env-gated; Groups need a claimed username. Pending: **end-to-end live verification** + Stage F                            |
| **Multi-device & recovery** 🚧 | Phase 1.5 Track F | Recovery model on top of C/D/E ([plan](plans/phase-1.5-track-F-multi-device-recovery.md)). **F1 ✅** phantom-claim fix; **F2 ✅** recovery hardening + restore-on-reinstall + account-start flow (Screen A cards → Screen B tabs → handle-recovery; mandatory username + claim at onboarding); **F3 ✅** passphrase reclaim (Ed25519). Three recovery surfaces: restore-on-reinstall, username+passphrase reclaim, **device pairing/QR (F4, next)**. Deferred: group-recovery-after-reclaim, groups-side account-delete cleanup |
| **AI Categorisation** | Phase 2              | Anthropic API proxy, PII stripping, transaction → category suggestion                                                                                                                                                                                                                                                                                                |

### D1 database schema (server-side — no financial data ever, no PII)

```sql
-- Auth/Identity (Track C):
users          -- user_id PK, username UNIQUE (optional/nullable), public_key, kdf_salt, created_at, updated_at  (NO phone, NO phone_hash)
devices        -- device_id PK, user_id, public_key, label, revoked_at
-- NOTE (Model B): NO user_blobs table. The personal .penny blob lives in the user's OWN
-- Google Drive/iCloud — our servers store NOTHING personal. Recovery = sign into Drive → pull blob.
-- Groups (Track E) — shared group data DOES relay through the server (WhatsApp split: membership +
-- ciphertext on server; personal history in Drive):
groups         -- group_id PK, type, enc_name, owner_id, key_epoch, created_at
group_members  -- group_id, user_id, role, joined_at, left_at
group_events   -- group_id, seq, event_id, author_id, key_epoch, r2_key  (encrypted event ledger — group ciphertext only)
-- API Proxy (Track A) — vehicle permanent cache + queue + budget:
vehicle_cache  -- regno PK, data, fetched_at
vehicle_queue  -- regno PK, requested_at, attempts, last_attempt_at
vahan_budget   -- day PK (IST), used
```

### KV cache keys

| Key pattern              | TTL      | Purpose                                  |
| ------------------------ | -------- | ---------------------------------------- |
| `proxy:yf:{path}{query}` | 15 min   | Yahoo market/stock passthrough (Track A) |
| `proxy:mfapi:{path}`     | 24h / 1h | MFAPI NAV (24h) / search (1h)            |
| `proxy:nps:{path}`       | 1wk / 1h | NPS scheme list (1wk) / NAV (1h)         |
| `proxy:ig:{path}{query}` | 15 min   | IPO / GMP passthrough                    |
| `rl:{ip}:{bucket}`       | 60 s     | Per-IP rate-limit counter                |
| `username:{name}`        | 5 min    | Username availability check (Track C)    |

---

## Phase 1.5 — Authentication

### Approach: on-device keypair + username (NO phone, NO OTP)

Phone + OTP was **dropped** (Track A reconciliation): SMS gateways cost money and a phone number is
maximal PII — both contradict the product. Identity is instead:

- an on-device **keypair** (signing + wrapping) generated lazily at claim time,
- the existing **`Profile.userId`** (UUID, generated at onboarding), and
- a self-chosen **`username`** (the public sharing handle; it can never decrypt anything).

**Chosen because:** zero PII, zero per-message cost, identity continuity (claiming is a pure relabel),
and it keeps the app fully usable offline.

### What the server stores

- **No phone number, no email.** No PII.
- Username: plaintext (it's public — used for invites/sharing)
- Public key(s): the device's signing/wrapping public keys (for auth + group key exchange)
- **No personal blob by default (Model B).** The `.penny` export lives in the user's own
  Drive/iCloud; our servers store only identity + group-membership metadata and per-group
  ciphertext. (An **optional, entitlement-gated** server-blind blob remains available as a
  convenience for users who won't enable Drive — off by default.)

### Username rules

- 3–20 characters, lowercase alphanumeric + underscore only
- **Optional in Phase 1** (auto-suggested from display name; live format validation). The permanent
  anchor is `userId` (UUID) — nothing keys off the username string.
- Uniqueness is **deferred to claim time** (no server in Phase 1) — claiming confirms it's free

### Auth flow (no OTP)

1. Choose username (optional; format-validated locally; uniqueness confirmed at claim).
2. App generates the keypair on-device; the private key lives in the encrypted local DB (DMK-protected).
3. **Register/claim:** upload `user_id`, `username`, public key, `kdf_salt`.
4. **Steady state:** each request is signed (`nonce‖method‖path‖bodyHash`) with the device key; the
   worker verifies against the stored public key.
5. **Recover-from-nothing (Model B):** sign into the user's own Drive/iCloud → pull the encrypted
   `.penny` blob → enter passphrase → DMK + device key + every Group Key restored; the server's
   membership table says which groups to re-pull. The passphrase is the only decryption secret and
   never leaves the device. (Detail in the parent plan, Track C + `docs/BACKEND_STRATEGY.md` §5.)

---

## Phase 1.5 — Encryption & Backup

### Encryption model: Option A (client-side keys, maximum privacy)

**Decision:** No key escrow. No server-side key recovery. This is the privacy promise.

- Personal data: encrypted with user's Master Key (passphrase-derived). Server never sees it.
- If passphrase is lost: data is permanently unrecoverable. User was warned during onboarding.

### Backup: User-owned cloud storage

- Personal data backed up as an **encrypted blob** to **Google Drive / iCloud** (user's choice)
- We never touch the backup file — it lives in the user's own cloud storage
- Restore: new device → sign into the user's own Drive/iCloud → download the encrypted blob → enter passphrase → decrypt on-device (the server's membership table then says which groups to re-pull)
- This is the same model as WhatsApp backups — users understand it (server holds membership; Drive holds the personal blob + keys)

### Household / group key exchange

Each group has its own **Group Key** (AES-256), completely independent of personal data keys.

**Key exchange during invite:**

1. User A creates a group → app generates Group Key → stores it in User A's encrypted local DB
2. User A invites `@username_b`
3. User B accepts the invite (authenticated via OTP)
4. User A's app encrypts the Group Key with User B's **public key**
5. The encrypted package is sent to User B via the Groups Worker
6. User B's app decrypts the package with their **private key** → stores Group Key in their encrypted local DB
7. Both users now have the Group Key locally. Server only handled the encrypted package — never saw the Group Key.

**Shared expenses** are encrypted with the Group Key before leaving the device. Server stores ciphertext blobs only.

**What the server can see:** User identities (public key + optional username — **no phone, no PII**), group membership graph, and per-group ciphertext events. **No personal blob (Model B — it's in the user's own Drive/iCloud).** Never financial data.

---

## Phase 2

### Chip — Real AI

- Switch `CHIP_MODE` from `'mock'` to `'real'`
- `buildUserContext()` → PII scanner → Anthropic SDK → `claude-sonnet-4-6`
- Temperature: 0.3 for analysis, 0.7 for conversation
- Max tokens: 1200 (analysis) / 800 (conversation)
- User supplies their own Anthropic API key (stored encrypted with Master Key)
- Optional: shared server-side key with per-user rate limiting (freemium model decision TBD)

### AI Auto-categorisation

**How it works:**

1. User adds a transaction (or imports from bank statement)
2. App sends merchant name + amount band to **AI Categorisation Worker** (strips PII first)
3. Worker calls Claude: "What expense category is this? [merchant, ₹amount band]" → returns category suggestion
4. User confirms or overrides
5. Override is stored locally as a **personal rule**: `{merchant: "BigBasket" → "Groceries"}`
6. Future occurrences of the same merchant use the local rule without any API call

**Privacy:** Only merchant name + amount band leaves the device. No account numbers, no personal details.

**Local rules engine:** After ~3–4 months of corrections, 80–90% of categorisations happen offline via local rules. API calls become rare.

### Mobile apps (iOS + Android) — 🚧 in progress, superseded from "Phase 2 future" to active migration

Full plan (locked decisions, tracks, verification): [`docs/plans/mobile-migration.md`](plans/mobile-migration.md).
Superseded from this section's original sketch:

- **Expo (managed workflow)**, not bare React Native CLI, not Capacitor — a single codebase targets iOS,
  Android, and eventually web via `react-native-web`.
- **NativeWind** for styling (not plain RN StyleSheet as originally sketched here) — reuses the same
  semantic token names already in `src/index.css`/`docs/DESIGN_GUIDELINES.md`, lowering the risk of visual
  drift between platforms.
- Shared: `packages/core/` (moved from `src/core/` + `src/lib/` in Track 0) — business logic, formatters,
  calculators, repository pattern, all portable with near-zero changes.
- Storage/crypto adapters: `expo-sqlite` (behind `EncryptedRepository<T>`'s existing interface) and
  `react-native-quick-crypto` (polyfills `crypto.subtle`, so `engine.ts`/`securityManager.ts` need no logic changes).
- The component extraction in Pre-Phase 1.5 (semantic props API, no Tailwind leakage into feature code)
  is what made this migration's shared-core boundary clean to extract in Track 0.

### Other Phase 2 items

- CAS PDF import (casparser SDK) — MF + stocks from CDSL/CAMS statements
- EPFO passbook PDF import (PDF.js)
- Export: wealth snapshot PDF + tax summary PDF
- Desktop layout (≥768px breakpoint, sidebar nav)
- Push notifications (EMI reminders, insurance renewals, goal milestones)
- Watchlist (stocks + MFs with price alerts)
- **Persistent storage on native (Capacitor) builds** — Penny never calls `navigator.storage.persist()`, so a WebView's IndexedDB (which holds the encrypted vault) is "best-effort" and could be evicted by the OS under storage pressure. Before shipping native apps, request persistence on boot and verify it's granted on real devices. Verification steps in [ANDROID_EMULATOR.md → Storage durability on device](ANDROID_EMULATOR.md#storage-durability-on-device-phase-2-to-do).

---

## Phase 3

- Regional languages (Hindi first, then Tamil, Telugu, Kannada, Marathi)
- Crypto / Web3 asset tracking
- International equities (US stocks, ETFs)
- Advanced AI advisor (life event workflows, personalised financial plan)
- RBI Account Aggregator (AA) framework sync when EPFO joins as FIP

---

## Deferred from Phase 1 (awaiting Phase 2+)

| Feature                            | Originally planned    | Moving to                                                                                           |
| ---------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| CAS PDF import                     | M11 step 70           | Phase 2                                                                                             |
| Watchlist                          | M11 step 71           | Phase 2                                                                                             |
| Export PDF/HTML                    | M8 step 47 (CSV done) | Phase 2                                                                                             |
| Chip mock chat UI                  | M8 step 44            | Phase 2                                                                                             |
| Desktop layout                     | M8 step 48            | Phase 2                                                                                             |
| Real Chip AI                       | All of Phase 1        | Phase 2                                                                                             |
| SMS transaction parsing            | BRD v4                | Phase 2                                                                                             |
| Credit score via bureau aggregator | BRD v4                | Phase 2                                                                                             |
| Biometric auth                     | TSD v1.0              | Phase 2 (native app) — WebAuthn-PRF on PWA too patchy; envelope crypto leaves a wrapping slot ready |
| Cloud backup                       | Phase 1.5/2           | **Pulled into Phase 1** (Track 2) — user-owned Google Drive                                         |
| Change passphrase / PIN            | "planned"             | **Pulled into Phase 1** (Track 2) — trivial under envelope crypto                                   |

---

## Open decisions

| #   | Decision                                                             | Status                                                              |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| D1  | PBKDF2 iteration counts (600K/200K)                                  | Benchmark on mid-range Android before Phase 2                       |
| D2  | App pricing model (freemium vs subscription vs one-time)             | Decide before Phase 2 launch                                        |
| D3  | Shared Anthropic API key strategy (rate limiting approach)           | Decide with pricing model                                           |
| D4  | Which bureau aggregator (OneScore / Finbox / CreditMantri / Perfios) | Phase 2 — evaluate at time of implementation                        |
| D5  | Petrol/diesel/LPG in market strip                                    | No free client-callable API exists. Plan when backend is available. |
