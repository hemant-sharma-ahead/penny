# Penny — Roadmap & Architecture Decisions

This document records the product roadmap for Phase 1.5, 2, and 3, along with the key architectural decisions made for each phase. Decisions are recorded here so they don't need to be re-derived in future sessions.

**Last updated:** 2026-06-26 (Phase 1.5 planning session)

> **Phase 1.5 detailed plan:** [`docs/plans/phase-1.5-groups-household-os.md`](plans/phase-1.5-groups-household-os.md).
> That plan supersedes the phone+OTP auth design recorded in the Phase 1.5 sections below
> (replaced by on-device keypair + username lookup + server-blind blob, **no PII**). The
> sections below are retained for history pending reconciliation in Track A.

---

## Phase boundaries

| Phase            | Scope                                                                                                                                     | Status                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Phase 1 (M0–M15) | Full financial life tracking, zero paid APIs, zero backend, local-first encrypted                                                         | ✅ Complete                                                                |
| Pre-Phase 1.5    | Documentation overhaul, component extraction, onboarding v2, category overhaul, activity log, expense power features, tax-in-context      | ✅ Complete                                                                |
| Phase 1.5        | Groups & Household OS — shared expenses, family vaults, joint goals, household net worth ([plan](plans/phase-1.5-groups-household-os.md)) | 🚧 In progress (Track 1 IOU ledger ✅ complete; next: Track A — API Proxy) |
| Phase 2          | Chip real AI, AI auto-categorisation, export PDF/HTML, cloud sync, native apps, desktop layout                                            | ⏳ Future                                                                  |
| Phase 3          | Regional languages, crypto/Web3, international equities, advanced AI advisor                                                              | ⏳ Future                                                                  |

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

### Platform decision: Cloudflare Workers + D1 + KV

**Chosen over Supabase because:**

- Already using Cloudflare Pages for hosting — zero new vendor
- D1 (SQLite at edge) is sufficient for identity + group membership (not financial data)
- KV covers API response caching (market data, MF NAVs)
- Workers solve CORS + rate limiting for external APIs
- Edge-deployed globally — fast for Indian users
- Free tier: 100K Worker requests/day, 5M KV reads/day, D1 generous free tier

### Four Workers (deployed independently)

| Worker                | Ships in                                                  | Purpose                                                                              |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **API Proxy**         | Phase 1.5 start (or earlier if CORS bugs become blocking) | Proxy for Yahoo Finance, vahandetails.com, market data — fixes CORS, adds KV caching |
| **Auth**              | Phase 1.5                                                 | Phone OTP, username availability check, user registration, public key storage        |
| **Groups**            | Phase 1.5                                                 | Group creation, member management, encrypted shared data blobs, key exchange         |
| **AI Categorisation** | Phase 2                                                   | Anthropic API proxy, PII stripping, transaction → category suggestion                |

### D1 database schema (server-side — no financial data ever)

```sql
users          -- id, phone_hash, username, public_key, created_at
groups         -- id, type (couple|family|flatmates|custom), name, owner_id, created_at
group_members  -- group_id, user_id, role (owner|admin|member), joined_at, left_at
group_data     -- id, group_id, encrypted_blob, data_type, updated_at
username_idx   -- username → user_id (for availability check + invite lookup)
```

### KV cache keys

| Key pattern           | TTL    | Purpose                                     |
| --------------------- | ------ | ------------------------------------------- |
| `market:{ticker}`     | 15 min | Sensex, Nifty, Gold, Silver, USD-INR, Crude |
| `mf_nav:{schemeCode}` | 24h    | MFAPI.in NAV responses                      |
| `otp:{phone_hash}`    | 5 min  | OTP verification codes                      |
| `username:{name}`     | 5 min  | Username availability check results         |

---

## Phase 1.5 — Authentication

### Approach: Phone number + OTP

**Chosen because:**

- No email required — no inbox to phish
- No OAuth — no Google/Apple dependency
- SMS OTP is universally understood in India
- Fits the privacy-first positioning

### What the server stores

- Phone number: **hashed** (SHA-256 + server-side salt) — never plaintext
- Username: plaintext (it's public — used for invites)
- Public key: user's RSA/EC public key (for group key exchange)

### Username rules

- 3–20 characters, lowercase alphanumeric + underscore only
- Unique across all users
- Real-time availability check during onboarding (Cloudflare Worker query)
- Suggestions shown when taken (append numbers, variations)
- Optional in Phase 1 (field exists in profile), **required** when joining/creating a group in Phase 1.5

### Registration flow

1. Enter phone number → OTP sent → OTP verified
2. Choose username (with live availability feedback)
3. App generates public/private keypair on-device
4. Private key stored in user's encrypted local DB (protected by Master Key)
5. Public key uploaded to server — used by others to encrypt group keys for this user

---

## Phase 1.5 — Encryption & Backup

### Encryption model: Option A (client-side keys, maximum privacy)

**Decision:** No key escrow. No server-side key recovery. This is the privacy promise.

- Personal data: encrypted with user's Master Key (passphrase-derived). Server never sees it.
- If passphrase is lost: data is permanently unrecoverable. User was warned during onboarding.

### Backup: User-owned cloud storage

- Personal data backed up as an **encrypted blob** to **Google Drive / iCloud** (user's choice)
- We never touch the backup file — it lives in the user's own cloud storage
- Restore: new device → OTP auth → enter passphrase → download backup from Drive → decrypt on-device
- This is the same model as WhatsApp backups — users understand it

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

**What the server can see:** User identities (hashed phone, username), group membership graph, ciphertext blobs. Never financial data.

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

### Mobile apps (iOS + Android)

- React Native with shared core hooks and business logic
- Platform-specific UI layer (not Tailwind — React Native StyleSheet)
- Shared: all `src/core/` logic, formatters, calculators, repository pattern
- The component extraction in Pre-Phase 1.5 (semantic props API, no Tailwind leakage into feature code) makes this migration mechanical

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
