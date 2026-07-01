# Backend Strategy & Scale Plan (Phase 1.5+)

> **Purpose.** Decide _what_ runs on Cloudflare, _how_ it's built and deployed (especially once the
> app is a Capacitor native app, not just a PWA), and how to serve **10M users at/near the Cloudflare
> free tier**. Read this **before** doing the Cloudflare setup or building Tracks C–E.
>
> **Status:** **decided 2026-06-27** — the key decisions (Model B backup, Drive-both-platforms,
> market→CDN, domain deferred) are **settled**; see §9. **Supersedes** the recovery/backup parts of
> [`plans/phase-1.5-groups-household-os.md`](plans/phase-1.5-groups-household-os.md) and the
> auth/backup architecture sections of [`ROADMAP.md`](ROADMAP.md) (both reconciled to Model B on
> 2026-07-01). Read this **before** the Cloudflare setup or building Tracks C–E.

---

## 1. How a Worker is built & deployed (and what "changed")

There are **two ways** to create a Cloudflare Worker:

| Approach                 | What it is                                          | Good for                                  | Why not for us                                                                                          |
| ------------------------ | --------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Dashboard Quick Edit** | Paste ~10–15 lines of JS in the browser dashboard   | A toy, single-file proxy with no bindings | Can't cleanly bind KV/D1/Cron, no TypeScript, no tests, no version control, no code review, no rollback |
| **Wrangler (repo)** ✅   | `workers/api-proxy/` deployed via `wrangler deploy` | Real, multi-file, bound, tested workers   | What we use                                                                                             |

So your memory of "paste 15 lines" was the **dashboard route** — correct for a trivial proxy. Our
proxy grew into a multi-file TypeScript worker with KV + D1 + Cron + a queue + unit tests, so it lives
in the repo and ships via Wrangler. **Same Cloudflare, production-grade path.**

**Deployment is independent of the app.** `wrangler deploy` (manual now; CI later) publishes the
worker to its URL. Nothing about an app release touches it.

---

## 2. The Worker is backend infra — NOT part of the app bundle (Capacitor reality)

This is the crux of your native-app question.

- The Worker lives at a **URL** (e.g. `https://api.<domain>`). The app — whether PWA in a browser or
  **Capacitor wrapping the same web build in a native WebView** — is just a **client** that calls that
  URL over HTTPS. The worker doesn't know or care whether the caller is a browser or an app.
- **You deploy the worker once.** You redeploy it **only when backend logic changes** — _never because
  you shipped a new Android/iOS version._ App versions are clients; the backend is shared.

### The one coupling, and how to remove it

The API base URL (`VITE_API_PROXY`) is **baked into the web build at compile time**, and Capacitor
ships that bundle inside the app binary. Two rules keep this from biting:

1. **Stable custom domain for the API** (e.g. `api.<domain>`), not a raw `*.workers.dev` URL. Then the
   URL compiled into every app binary never changes, even if you re-deploy/rename the worker.
2. **Remote config at startup** (optional but recommended for native): the app fetches a tiny
   `config.json` (from the CDN) holding the current API base + minimum-supported version. This lets you
   **move the backend or force-upgrade without an app-store release** — essential for native apps you
   can't force-update instantly.
3. **Version the API path** (`/v1/…`, `/v2/…`). Old store binaries keep hitting `/v1`; new ones use
   `/v2`. Never break a contract an installed binary depends on.

### CORS / native

The worker returns `Access-Control-Allow-Origin: *` (public, read-only data), which covers browser
origins and the native WebView origin (`capacitor://localhost` / `https://localhost`). No per-platform
CORS work needed. Authenticated endpoints (Tracks C–E) are gated by **signed requests**, not origin.

**Bottom line:** building/deploying the worker is a **one-time backend task**, decoupled from the
Capacitor app lifecycle. You will _not_ rebuild the worker per app iteration.

---

## 3. Scale model for 10M users — the wake-up call

### Cloudflare unit economics (free → overage)

| Product                                   | Free tier                                       | Overage (Workers Paid $5/mo base)                    |
| ----------------------------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| **Pages** (static PWA/app shell + assets) | **Unlimited** requests + bandwidth              | — (free at any scale)                                |
| **Workers**                               | 100K req/day (~3M/mo)                           | 10M req incl., then **$0.30/M req** + $0.02/M CPU-ms |
| **KV**                                    | 100K reads, 1K writes/day, 1 GB                 | reads **$0.50/M**, writes **$5/M**, $0.50/GB         |
| **D1**                                    | 5 GB, 5M row-reads/day, 100K writes/day         | reads $0.001/M, writes **$1/M**, $0.75/GB            |
| **R2**                                    | 10 GB, 1M writes, 10M reads/mo, **egress free** | storage **$0.015/GB**, writes $4.50/M, reads $0.36/M |

The lever is row 1: **static assets on Pages are free and unlimited at any scale.**

### Naïve design (everything per-user through the Worker) — DON'T

At 10M registered / ~3M daily-active, routing market data + NAVs + sync per-user through the worker:

- ~25 market/NAV calls/user/day → **~2.3B worker req/mo + ~2.3B KV reads/mo**
- ~10 sync calls/user/day → **~0.9B worker req/mo**

→ ≈ **$950/mo** worker requests + **$1,120/mo** KV reads ≈ **$2,000+/mo, ~1000× over free tier.**

**The trap:** the N→1 cache collapses _upstream_ (Yahoo/MFAPI) calls, but **every user still invokes
the Worker + a KV read on a cache HIT.** Worker invocations scale linearly with users.

### The fix — split GLOBAL data from PER-USER data

- **Global, identical-for-everyone data** (market indices, gold/forex, MF/NPS NAVs, merchant
  dictionary): a **Cron Worker** refreshes it on a schedule and writes **one static JSON to Pages/R2**;
  every client reads it over the **CDN** → _zero per-user worker calls, free unlimited bandwidth._
  10M users cost ≈ the same as 100.
- **Per-user encrypted state** (sync, auth, group events): genuinely per-user → Workers/R2/D1, but
  scales with _active synced_ users (a fraction) and is cheap-linear.
- **Vehicle:** per-reg permanent D1 cache → volume ≈ globally-new regs/day, **independent of user count.**

### Optimized at 10M registered / ~3M DAU

| Layer                                                     | Est. monthly |
| --------------------------------------------------------- | ------------ |
| Global market/NAV/dictionary (Cron → static CDN)          | ~**$0**      |
| Per-user sync/auth/groups workers (~7 req/day/synced DAU) | ~**$190**    |
| R2 storage (only if we store blobs — see §5)              | ~$75/TB-mo   |
| D1 metadata (users/devices/memberships)                   | ~**$0–5**    |

→ **~$200–300/mo at 10M** (or far less if we store no personal blobs, §5). **Fully free to ~100–300K
users.** Usage-based, linear, no re-platforming. The "free + privacy" promise survives.

---

## 4. Store as little as possible (storage strategy)

The cheapest, most private byte is the one we never store. Ranked by _our_ server footprint:

**Receipts / images** (the single heaviest data — a compressed JPEG is 50–200 KB; 1,000 ≈ 100 MB/user):

1. **On-device only** — receipts never leave the phone. Our servers store **0**. Lost on device loss
   _unless_ the user has their own cloud backup. ✅ simplest, cheapest, most private.
2. **User's own Drive/iCloud** — part of the user-owned backup (see §5). Our servers store **0**.
3. ~~Our R2, content-addressed + dedup~~ — only if we _must_; costs storage. **Avoid.**

**Decision:** **receipts never touch our servers.** They stay on-device and ride the user's own cloud
backup. This removes the only data class that would actually strain R2.

General principles:

- Server holds **ciphertext or nothing** — never plaintext financial data.
- Server holds **metadata, not content**, wherever possible (e.g. "user X is in group Y", not the data).
- Prefer **derive-on-device** over **store-on-server**.

---

## 5. The big decision: do we store ANY backup on our servers?

### Two models

|                       | **Model A — server-blind blob** (current plan)             | **Model B — user-owned cloud only** (proposed) ✅        |
| --------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| Personal backup       | Encrypted blob in **our R2** (primary) + Drive (secondary) | **User's Drive/iCloud only** — we store nothing personal |
| Receipts              | In the blob (our R2)                                       | In the user's own cloud                                  |
| What we store         | Identity + membership + **every user's blob**              | Identity + membership + **group event ciphertext only**  |
| Recovery-from-nothing | username → pull our blob → passphrase                      | sign into Drive/iCloud → pull user's blob → passphrase   |
| Multi-device          | Pull our blob, or QR pairing                               | User-cloud blob, or QR pairing                           |
| Groups                | Server relay (R2/D1)                                       | Server relay (R2/D1) — **same**                          |
| Our storage @10M      | TBs (blobs + receipts) → $$                                | **~MBs** (metadata + group ciphertext) → ~free           |
| Privacy               | We hold ciphertext we can't read                           | We hold even less                                        |
| Failure mode          | We must keep blobs durable                                 | User must have set up their cloud backup                 |

### Why Model A (server-blind blob) was the original default — and what Model B trades away

Recorded so we don't re-litigate it. Model A buys **zero-config, guaranteed recovery**:

1. **Recovery works even if the user never set anything up.** A blob auto-uploaded on sync means
   recovery is just **username + passphrase** — even for a careless user. Under Model B, if the user
   never enabled Drive backup before losing the phone, **there is nothing to recover.** For a finance
   app where losing years of data is catastrophic, this auto safety-net was the main reason.
2. The marketed **"recover from nothing"** flow (username → pull blob → passphrase → _groups reappear,
   no rejoin_) needs us to hold the blob + membership.
3. We **already run the server for groups**, so also holding the personal blob is _incremental_ — one
   unified sync mechanism instead of two (Drive for personal, server for group).
4. **Smoother multi-device + conflict handling** via a server cursor (optimistic concurrency) vs.
   coordinating through the user's Drive (quotas, same-account requirement, weaker conflict story).
5. **No third-party dependency** for the core promise — works even if the user doesn't use Google,
   revokes Drive, or is on a platform where Drive is awkward.

Model B doesn't _fail_ recovery — it makes recovery the **user's responsibility** (they must have set
up Drive). The chosen reconciliation (below) keeps Model B's cost/privacy **and** Model A's safety net.

### Key realization

- **Personal sync/backup can be 100% user-cloud — we store nothing.** The app already has Google Drive
  backup (`src/core/backup/cloudBackup.ts`); this extends it to be the _primary_ path.
- **Groups are the only thing that genuinely needs a server.** Members aren't online simultaneously, so
  shared encrypted events/key-grants must land somewhere both can reach. That relay is **small**
  (ciphertext events, only for users actually in a group) and is the _only_ per-user data we'd hold.

### Recommended: **Model B**

Our servers hold **only**:

- **D1 (tiny):** `users` (user_id, username, public_key, kdf_salt), `devices`, `group_members`,
  `group_key_grants` — identity + membership metadata, no content.
- **R2 (small, group users only):** `group_events/{group_id}/{seq}` = encrypted event ciphertext.
- **Public-key directory** (in D1) for key exchange.

Everything personal — transactions, holdings, **receipts**, the whole `.penny` blob — lives **on-device
and in the user's own Drive/iCloud.** We never see it.

### Data flows under Model B

- **Identity (lazy, opt-in at sharing):** generate keypair on-device → register `username` + public key
  to D1. No PII. A non-sharing user registers nothing.
- **Personal backup:** encrypted `.penny` blob (incl. receipts) → **user's Drive/iCloud** on a schedule.
  We are never in the path.
- **New device / reinstall recovery:** sign into the user's own Drive/iCloud → pull the encrypted blob →
  enter passphrase → fully restored (DMK + device key + every Group Key, which live inside the blob).
  Or **device-to-device QR pairing** when both devices are present (no cloud needed).
- **Groups:** create/join via invite → members upload public keys → admin wraps the Group Key into
  `group_key_grants` (D1) → shared expenses become encrypted events in R2 → members pull + decrypt.
  Leave → bump key epoch, re-wrap to remaining members. (Unchanged from the parent plan — this part
  _must_ be server-relayed.)

### This is exactly how WhatsApp works (and why groups survive a reinstall)

WhatsApp uses **both** a server and Google Drive, **split by type of data** — the same split as Model B:

- **WhatsApp's servers hold identity + group membership + metadata** (keyed to your phone number):
  which groups you're in, group name/participants, your public keys. Message _content_ is E2E and
  not stored (relayed, then deleted on delivery).
- **Google Drive holds only your message/media history** (a copy of the on-device SQLite store) — the
  _content_, not the structure.
- **Recovery:** reinstall → verify phone (OTP) → the **server** repopulates your **groups + contacts**
  (because it tracks membership) → then Drive restores your **chats/media**. So groups reappear from
  the **server**, not Drive; Drive only brings back history.

Penny's mapping (we're more private + cheaper):

|                                | WhatsApp                                               | Penny (Model B)                                                                         |
| ------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Identity key                   | Phone number (PII)                                     | Keypair + self-chosen username (no PII)                                                 |
| Server stores                  | Account, group membership, metadata; relays ciphertext | Identity/membership (D1) + group event ciphertext (R2)                                  |
| Drive stores                   | Message + media history                                | The encrypted `.penny` blob = all personal data + receipts + **your keys + group keys** |
| Content E2E from us            | Optional (off by default historically)                 | **Always** — server never sees plaintext                                                |
| "Groups reappear" because      | Server tracks membership                               | Server tracks membership (same)                                                         |
| Personal history restored from | Drive                                                  | Drive                                                                                   |

So making Drive backup mandatory "like WhatsApp" is precisely right: groups come back from **our
server membership**, personal data comes back from **the user's Drive blob**. Penny is actually more
self-contained on recovery — the Drive blob carries the identity keypair **and** the group keys, so a
user can restore everything from Drive + passphrase even before re-contacting the server.

### Trade-offs to accept for Model B

- **Recovery depends on the user having set up their cloud backup.** If they didn't and lose the device,
  data is gone — _which is already our privacy stance_ ("passphrase lost = data unrecoverable"). Mitigate
  by making Drive backup a **near-mandatory, ideally auto-enabled** onboarding step so the "never set up
  backup" footgun mostly disappears.
- **Google Drive on BOTH platforms (decided).** One integration (the existing `cloudBackup.ts`) for
  Android _and_ iOS — no iCloud/CloudKit needed. iOS users sign into a Google account (normal, acceptable).
- **"username → recover from nothing" no longer returns data from us** — username lookup returns only the
  _pointer/metadata_; the actual blob comes from the user's Drive. Acceptable.
- **Optional hybrid safety-net:** offer an _opt-in_ server-blind blob (Model A) for users who don't want
  to manage Drive — entitlement-gated, can be a paid convenience later. **Default = Model B (store
  nothing); Drive auto-backup strongly encouraged; hybrid available.**

### Backup vs. live multi-device sync — don't conflate them

Two different problems often lumped as "sync":

1. **Backup / new-device / recovery** — a periodic encrypted snapshot; restore on a new phone or after
   reinstall. One-way, infrequent, no concurrency. → **Model B handles this fully via Google Drive.**
   _Unaffected_ by storing nothing on our servers.
2. **Live multi-device sync** — the user actively uses two devices and a change on one appears on the
   other, including merging _offline_ edits from both. Continuous, bidirectional, concurrent → needs an
   ordering authority + conflict resolution. (This is **Track D**, not shipping yet; most users are
   single-device.)

**Model B does NOT mean "Drive is the sync transport."** It only means we don't durably store the whole
personal backup blob. Live sync (#2), when built, rides the **same encrypted-event relay we build for
groups** — a _"personal group of one"_:

- Devices exchange **small encrypted deltas** through the server's event ledger, ordered by `seq` /
  `sync_cursor`, reconciled with **last-write-wins over the activity log** (the Track-4 mechanism).
- The server relays **transient ciphertext deltas** — it never holds the full dataset and never reads
  anything. Plus **device-to-device QR pairing** for the "copy from my old phone" case (no server, no Drive).
- This yields the **same clean cursor/conflict handling** as a stored-blob-on-server approach (Model A),
  but **without storing the backup** — same correctness, less storage, more private.

So Model B rules out exactly one variant — _store the whole blob on our server and diff it_ — and
replaces it with _relay encrypted deltas through the groups infra_. Don't treat "no server backup" as
"no clean multi-device sync"; the event-ledger + cursor gives us that regardless. **Syncing _through
Google Drive_ (file store, no atomic compare-and-swap, same-account, clobber-prone) is explicitly NOT
the live-sync path** — Drive is for backup/recovery only.

---

## 6. What goes into Cloudflare — final picture

| Data                                                | Where                                                        | Per-user?                  | Cost driver                           |
| --------------------------------------------------- | ------------------------------------------------------------ | -------------------------- | ------------------------------------- |
| App shell + static assets                           | **Pages**                                                    | No                         | free/unlimited                        |
| Market indices / metals / forex (ticker strip)      | **Cron → static JSON (Pages/R2)**, client via CDN            | No (global, fixed set)     | ~free                                 |
| MF / NPS NAV (per-scheme), stock price (per-symbol) | **Cached passthrough (Worker + KV)** — shared N→1, daily TTL | Per-resource, not per-user | low (bounded by held schemes)         |
| Merchant dictionary (categorization)                | static asset on CDN, versioned                               | No (global)                | ~free                                 |
| Vehicle RC                                          | **D1 permanent cache + queue** (Track A ✅)                  | per-reg, not per-user      | ~free                                 |
| Identity / devices / membership / key-grants        | **D1**                                                       | Yes (metadata only)        | tiny                                  |
| Group event ciphertext                              | **R2** (group users only)                                    | Yes (group only)           | small                                 |
| **Personal data + `.penny` blob + receipts**        | **User's Drive/iCloud — NOT us**                             | n/a                        | **₹0 to us**                          |
| AI (Chip, Phase 2)                                  | Worker proxy holding the key                                 | Yes                        | **Anthropic tokens** (not Cloudflare) |

Two things stay **off** our servers entirely: **global data** (→ CDN) and **personal data/receipts**
(→ user's own cloud). That's what keeps 10M users in the **tens of dollars/month**, mostly the group
relay + a few Crons.

---

## 7. Free-tier runway & when you pay

- **To ~100–300K users:** effectively **free**, if global data is static-CDN and personal data is
  user-cloud. The only server traffic is identity + group relay.
- **At 10M users:** roughly **$5–50/mo** under Model B (Workers Paid base + modest group-relay
  R2/D1), vs ~$2,000+/mo under the naïve per-user-worker design. Worst case with our-R2 blobs (Model A)
  ≈ $250–300/mo.
- **The real cost at scale is Phase-2 AI tokens (Anthropic), not Cloudflare** — mitigated by the
  on-device rules engine (80–90% offline), amount-band/merchant-only payloads, and prompt caching.

---

## 8. Deployment checklist for native (Capacitor)

- [ ] **Remote `config.json`** on the CDN (API base + min-supported app version) fetched at startup —
      so the API URL is **not** hardcoded in native binaries (this is what lets us defer the custom domain).
- [ ] Ship on `*.workers.dev` now; adopt a **custom `api.<domain>`** later (email time) by repointing config — no rebuild.
- [ ] **API path versioning** (`/v1/…`) from day one.
- [ ] CI `wrangler deploy` (dev/staging/prod) — decoupled from app releases.
- [ ] D1 migrations **forward-only**, applied per env.
- [ ] **Google Drive backup on both platforms** (extend `cloudBackup.ts`); make it near-mandatory in onboarding.
- [ ] Global market/indices → **Cron → static CDN JSON** from the start (not per-user proxy).

---

## 9. Decisions (settled 2026-06-27)

1. ✅ **Model B** — user-owned **Google Drive** backup only; we store **no personal blob**. Drive backup
   is near-mandatory / auto-enabled in onboarding.
2. ✅ **Google Drive on both Android & iOS** — one integration (`cloudBackup.ts`); **no iCloud/CloudKit.**
3. ✅ **Optional hybrid** server-blind blob kept as an entitlement-gated convenience for users who won't
   use Drive (not the default).
4. ✅ **Defer the custom domain** until branded email (`support@…`) is needed; ship on `*.workers.dev` /
   `*.pages.dev` meanwhile, with **remote `config.json`** from day one so the API URL isn't hardcoded in
   native binaries. Use **Play/App Store reviews** as the feedback channel until Contact-us email ships.
5. ✅ **Market ticker strip → static CDN from the start** (fixed global set: indices/metals/forex, the
   highest-volume call). **Per-scheme MF/NPS NAV + per-symbol stock stay cached passthrough** (can't
   pre-generate thousands of schemes; low-frequency portfolio-view calls).

Reconcile [`plans/phase-1.5-groups-household-os.md`](plans/phase-1.5-groups-household-os.md) (Tracks C/D)
and [`ROADMAP.md`](ROADMAP.md) to match when those tracks are built.
