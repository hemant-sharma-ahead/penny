# Phase 1.5 Track F — Multi-Device, Account Sync & Recovery (plan + living doc)

> **Status:** 🚧 In progress. **F1 ✅** (phantom-claim fix) · **F2 ✅ deployed + live-verified 2026-07-05**
> (recovery hardening + restore-on-reinstall) · **F3 ✅ deployed + live-verified 2026-07-05**
> (username+passphrase reclaim, Ed25519 challenge) — all build + worker type-check + 408 tests green.
> Deferred: group recovery after reclaim (list-my-groups + re-grant). **Next: F4 device pairing/QR
> — discuss before starting.** This is the **living reference** for how a Penny account moves across
> devices, how groups and personal data sync, and what happens on erase/recovery.
>
> **Update discipline:** append a dated entry to the **Progress Log** (bottom) at every step, and keep the
> **Status** line + the row in [`docs/plans/README.md`](README.md) / [`docs/ROADMAP.md`](../ROADMAP.md) in
> sync. Related docs: [`account-lifecycle-recovery.md`](account-lifecycle-recovery.md) (recovery-worker
> mechanics), [`docs/BACKEND_STRATEGY.md`](../BACKEND_STRATEGY.md), Track C (auth), Track D (backup), Track
> E (groups).

---

## Why this doc exists

Multi-device + account recovery is the most confusing part of Penny's architecture because **three
different things sync in three different ways**, and the words "account", "login", and "sync" don't mean
what they usually mean in a cloud app. This doc is the single place that explains the model in plain
language, records exactly what happens in each lifecycle event (claim, erase, reclaim), and tracks the
implementation as we build it.

---

## Plain-language mental model (read this first)

Forget "username + password login." Penny works more like a **safe with a key**, not a bank account:

- **Your data lives on your device**, locked in a safe. The **key to the safe is the DMK** (data master
  key). Your **passphrase and PIN don't unlock data directly** — they unlock a small envelope that holds
  the DMK. (This part you already understand well.)
- **Your "account" is not a login — it's an identity.** It's a random `userId` + a pair of device keys
  (like a signet ring only your device holds) + your passphrase-wrapped DMK. The **username is just a
  public nameplate** you nail onto that identity so friends can find you. Typing someone's username on a
  new device does nothing — you don't have their signet ring or their safe key.
- **The server is a dumb relay (Model B).** It stores only nameplates (username → userId) and public
  keys, plus **encrypted** group messages it can't read. It never sees your data or your keys.

So to make a **second device "be you"**, two separate things must travel to it:

1. **The identity** — register the new device's signet ring under your account.
2. **The safe key (DMK)** — so it can actually open your data.

There are two ways to move those:

- **Restore a backup** (works today) — copy the whole safe + key + identity from your own Google Drive.
- **Device pairing** (the new work) — an existing device hands the new one the identity + key directly,
  no manual file.

And three things sync on their own once set up:

- **Groups** sync live through the relay (encrypted messages) — across your devices _and_ other people's.
- **Personal data** does **not** sync live — it travels only via your own backup. (Live personal sync is
  a bigger Phase 2 idea; see [Cost & storage](#cost--storage-why-no-r2).)

---

## The three sync flows (precise)

### Flow 1 — Groups, between multiple users (built in Track E; verification pending)

- Each group has one symmetric **Group Key**. Every event (shared expense, settlement, close…) is
  encrypted with it, then pushed to the `penny-groups` worker, which stores **only ciphertext** and
  assigns a monotonic `seq` (a global order). Balances are **never** stored server-side — each device
  folds them locally from the events ([`split.ts`](../../src/core/groups/split.ts),
  [`groupSync.ts`](../../src/core/groups/groupSync.ts)).
- **Getting a new member the key:** they redeem an invite (server sees only `SHA-256(secret)`) → an admin
  device wraps the Group Key to the joiner's public wrapping key (ECDH) and posts it as a **grant** →
  joiner unwraps it with their private key. Leaving/removal **rotates** the key (new epoch) so a departed
  member can't read new events.
- **Conflict model:** server `seq` for order, a `lamport` clock for pre-sequence tie-breaks, last-writer-
  wins on `updatedAt`, deletes as tombstones.
- **This is live cross-user AND cross-device sync — but only for group data, and independent of backup.**

### Flow 2 — One user, multiple devices (partial today)

- Account = `userId` + device identity keypairs (signing + wrapping) + passphrase-wrapped DMK. Username is
  a public handle, not a login.
- Device B becomes "you" only when it has (a) a device registration on the account and (b) the DMK.
  - **Backup / restore (built, Track D):** clone identity + keys + DMK + data from your own cloud.
    Point-in-time, not live.
  - **Device pairing (server half built, client UX missing — Track F work):** an already-signed-in device
    A registers B (`POST /device`, live) and grants B the DMK wrapped to B's key (same ECDH as group
    grants). Two independent devices, one account.
- Once B is on the account, **group data live-syncs to B automatically** (Flow 1). **Personal (non-group)
  data still arrives only via backup** — by design (Model B stores no personal data).

### Flow 3 — Backup & recovery

- The backup bundle carries: `security` (wrapped DMK + salts), `profile` (userId/username/deviceId),
  `device_keys`, `group_keys`, and all data. Restoring re-establishes the same account, DMK, and group
  keys → decrypt + signed calls + group pulls all work again.
- Recovery after an erase = restore a backup. **No username-only reclaim** (that would be account
  takeover). See [`account-lifecycle-recovery.md`](account-lifecycle-recovery.md).

---

## Account lifecycle — exactly what happens

| Event                                                                                              | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Server effect                                                                 | Recoverable?                                     |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------ |
| **Claim a username** (`claimAccount`)                                                              | Generates device keys (`ensureIdentityKeys`) → registers userId + username + public keys → confirms via `/whoami`. Sets `profile.deviceId` + `username` locally.                                                                                                                                                                                                                                                                                                                                                                                                                            | Nameplate + device keys stored.                                               | —                                                |
| **Erase everything** (Backup → reset)                                                              | 1) signed `DELETE /account` (best-effort) → 2) `wipeAllData()` clears **all** Dexie tables (profile, device_keys, group_keys, security/DMK, data) + locks keystore → 3) redirect to onboarding.                                                                                                                                                                                                                                                                                                                                                                                             | Deletes user + devices → **releases username** (if the signed call succeeds). | Only via a **backup** — the DMK is gone locally. |
| **Anti-theft PIN-failure wipe**                                                                    | `wipeAllData()` only — **no deregister** (the wiper may be a thief).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Username **stays** claimed.                                                   | Backup or 365-day GC.                            |
| **Manual / devtools wipe** (`localStorage.clear()` + `indexedDB.deleteDatabase('penny')` + reload) | Bypasses the app entirely: **no deregister**, no keystore lock — just nukes local storage. What a developer actually does when iterating.                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Username + old userId/device **stay** claimed (server untouched).             | Same handle only via backup / GC.                |
| **Uninstall → reinstall** (real users)                                                             | Same as a manual wipe in the way that matters: **there is no PWA "on-uninstall" hook**, so `deregisterAccount()` never runs. Local data is (usually) cleared by the OS; the server is untouched. _Caveat:_ some platforms (esp. desktop PWAs) leave origin storage behind on uninstall → reopening finds you still claimed. Mobile uninstall usually clears.                                                                                                                                                                                                                                | Username + old userId/device **stay** claimed.                                | Same handle only via backup / GC.                |
| **iOS 7-day storage eviction** (no user action)                                                    | Safari caps script-writable storage for standalone web apps and can **evict a PWA's IndexedDB after ~7 days of non-use** — no uninstall, no consent. Lands the user in the orphaned state involuntarily.                                                                                                                                                                                                                                                                                                                                                                                    | Server untouched → username **stays** claimed.                                | Same handle only via backup / GC.                |
| **Re-onboard after a wipe**                                                                        | Onboarding mints a **fresh `userId`** ([SetupCredentialsScreen.tsx:45](../../src/features/onboarding/SetupCredentialsScreen.tsx#L45)). The "username" typed on onboarding is stored **locally only** — it is NOT a claim, so `claimed` stays false and the Claim button shows.                                                                                                                                                                                                                                                                                                              | —                                                                             | —                                                |
| **Reclaim the same handle**                                                                        | If a prior **deregister succeeded** → handle is free → claims cleanly (new account, old data NOT back). Otherwise (erase-all deregister failed, PIN wipe, **or manual wipe**) the handle is still held by the dead old userId → `claimAccount` → `POST /register` → worker `holder !== userId` → **409** → `UsernameTakenError` → _"Already taken… restore a backup…"_. Note: `ensureIdentityKeys()` runs _before_ the 409, so fresh device keys persist locally but `profile.deviceId` is NOT set (the `put` is after the throw) → still unclaimed, safe to retry with a different handle. | —                                                                             | Same handle only via backup / GC.                |

**Key fragility:** the deregister on erase is **best-effort and silently swallowed** ([BackupPage.tsx:116](../../src/features/backup/BackupPage.tsx#L116)). If it fails (offline / worker error), the username is orphaned with no user feedback — the main recovery gap to harden. **The manual/devtools wipe never deregisters at all**, so repeated dev-testing steadily orphans handles on the server (a returning dev should reuse the same handle only via backup restore, pick a new handle each reset, or lean on the 365-day GC). Groups created before a wipe stay on the `penny-groups` server tied to the **old** userId — the new account can't see or decrypt them (orphaned; only a backup restore brings them back).

> **This is a normal-user path, not an edge case.** Uninstall/reinstall and iOS's 7-day eviction land a
> real user in the orphaned-handle state with **zero friction and no consent** — and the only path that
> cleans up server-side (in-app "Erase everything") is one they'll rarely take. So **recovery (F2/F3) is
> effectively load-bearing for the whole account model**, not a nicety: without it, the common act of
> reinstalling silently loses your handle _and_ your groups unless a backup existed. Argues for bumping
> F2/F3 priority, and for making backup setup prominent/near-default once a user claims a handle.

---

## What's built vs missing (honest inventory)

| Piece                                                             | State                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Auth worker: `/register`, `/whoami`, `/device`, `DELETE /account` | ✅ Deployed (`penny-auth.hesh.workers.dev`; `DELETE /account` verified live, returns 401 unauth) |
| Inactivity GC (365-day) + `last_seen`                             | ✅ Implemented (needs the launch-`/whoami` liveness ping — follow-up)                            |
| Group sync (Flow 1)                                               | ✅ Code-complete (Track E); end-to-end verification pending                                      |
| Backup / restore (Flow 3)                                         | ✅ Track D (Drive live)                                                                          |
| Honest `claimed` state (phantom-claim fix)                        | ✅ Fixed 2026-07-04 (this track)                                                                 |
| **Device pairing client UX (Flow 2)**                             | ❌ Missing — the main Track F feature                                                            |
| DMK-grant relay endpoint (for pairing)                            | ❌ Missing — small worker addition                                                               |
| Deregister-failure surfacing on erase                             | ✅ F2 (2026-07-04) — warns before orphaning a claimed handle                                     |
| Mandatory username at onboarding (sync builds)                    | ✅ F2 (2026-07-04)                                                                               |
| Backup nudge after claim                                          | ✅ F2 (2026-07-04) — warns when no off-device backup                                             |
| Restore-on-reinstall onboarding branch                            | ✅ F2 (2026-07-04) — `RestoreAccountScreen`, reuses `importBackup`                               |
| Passphrase reclaim (Ed25519 verifier + `/recover/*`)              | ✅ F3 (2026-07-04) — proof of ownership; WhatsApp parity                                         |
| Group recovery after reclaim (list-my-groups + re-grant)          | ⏸ Deferred (F3 follow-up / Track E) — identity+membership return, keys/content don't             |
| Groups-side cleanup on account delete                             | ❌ Missing — orphaned `group_members`/grants                                                     |
| Server-side E2EE data blob (restore-all-from-passphrase)          | ⏳ Deferred — reverses own-Drive Model B, storage cost                                           |
| Live personal-data sync                                           | ⏳ Phase 2 (see below)                                                                           |

---

## Cost & storage (why no R2)

We dropped R2 (paid) and store group event ciphertext inline in D1 because group data is small. **Device
pairing doesn't change this:** it only relays **identity + a wrapped DMK** (a few hundred bytes, one-time,
consumed on fetch) — trivially within D1/KV free limits. **Personal data never touches our server** — it
rides the user's own Google Drive backup (Model B). So pairing stays fully free-tier + Model B.

Only **live personal-data sync** would strain limits, and even then not via R2 (financial data is small
ciphertext; the same D1 event-log pattern would fit — the real ceiling is D1's ~100K writes/day at scale).
That remains **Phase 2**, out of Track F scope.

---

## Identity & recovery design — the key principles

Explored 2026-07-04, prompted by the WhatsApp comparison ("if they can reclaim a handle, why can't we").

### Proof of ownership is the real requirement

WhatsApp can reclaim a handle on a fresh install because it has a **verified side-channel** (SMS OTP —
soon passkey/email) that _proves_ you own the number/username. Anyone can type a handle; only the owner
receives the code. **Penny deliberately has no phone/OTP/email**, so today it has **no proof of ownership**
— which is the sole reason username-alone reclaim would be account takeover here. The design question is
therefore not "identify by username?" but **"what is Penny's proof of ownership?"**

**Answer: server-verified `username + passphrase` (SRP-style).** An SRP verifier lets the server confirm
you know the passphrase **without ever seeing it or storing a password-equivalent** — the same idea as
Signal's PIN / WhatsApp's encryption-password. This is the _"server auth (later)"_ always in the plan — **not**
the rejected phone/OTP. It is the ingredient that unlocks WhatsApp-style reclaim.

### Authentication ≠ decryption (the crux — do not conflate)

Two separate locks:

- **Authentication** — "prove you're `hem2182`." ✅ SRP (username + passphrase) solves this.
- **Decryption** — "can you read the ciphertext?" ❌ SRP does nothing here. Reading data needs the **key**,
  and in Model B **the server never has the key** — only ciphertext it can't read. **No amount of
  authentication can recover an encryption key the server never held.** This is inherent to E2EE, not a gap.

### What SRP does and does not recover

| Thing                    | Recovered by SRP alone? | How it actually comes back                                                                                                                      |
| ------------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity + `userId`      | ✅                      | username→userId lookup + passphrase verify → bind new device under the same userId                                                              |
| Group **membership**     | ✅                      | server re-associates you (membership is server-side, keyed by userId)                                                                           |
| Group **history (keys)** | ❌                      | **re-grant** from a co-member's device (ECDH; usually available — groups have ≥2 members), or your backup. Never from the server.               |
| Personal **data**        | ❌                      | **only your backup** — the DMK is a _random_ key (never derived from the passphrase), wiped on reinstall, with **no co-holder** to re-grant it. |

**WhatsApp is identical:** OTP rejoins your groups but old message history returns only from your
Drive/iCloud backup, never from WhatsApp's server. The only _unrecoverable_ group case is being the **sole
remaining key-holder with no backup** → ciphertext is permanently dead.

### `userId` stays (as internal anchor)

Keep a stable internal `userId` as the primary key; **username is a unique, mutable public handle that maps
to it.** Rename = relabel (not an account migration); all group memberships / grants / event-authorship
stay keyed by the stable id. What changes vs today: the `userId` stops being minted-fresh-and-lost on every
install — SRP makes it **recoverable** via username + passphrase.

### The three recovery surfaces (one shared key-grant mechanism)

1. **Restore-on-reinstall** — fast path for users _with_ a backup: identity + DMK + data + group keys all
   return; reclaim becomes idempotent.
2. **Username + passphrase reclaim (SRP)** — for users _without_ a backup (e.g. groups-only users):
   recovers identity + membership; group history via co-member re-grant. **The WhatsApp-parity piece.**
3. **Device pairing (QR)** — multi-device / "Penny on laptop"; an authenticated device approves a new one
   (same as WhatsApp Web; WhatsApp's upcoming "link by username" still needs primary-device/OTP approval).

### The one bigger, separate decision

"Restore **all** data from _just_ username + passphrase" (no user's-own-cloud) requires the server to store
your **encrypted DMK + encrypted personal data** keyed to the account. Still E2EE (server can't read it),
but it **reverses the "data on your own Drive" Model B choice** and **reopens the personal-data storage-cost
/ free-tier question** we closed by dropping R2. Essentially building WhatsApp's cloud backup into Penny's
servers. Legitimate, but costed — **not** something SRP gives for free. Deferred decision (Phase 2-ish).

---

## Implementation plan (steps)

1. **F1 — Phantom-claim fix** ✅ _(done 2026-07-04)_
   Demo no longer fakes a claim; `claimed` is honest; demo groups stay viewable, New/Join route to claim.
2. **F2 — Recovery hardening + restore-on-reinstall** (recovery surface #1) — ✅ _(build + 404 tests green; browser verification pending)_
   - ✅ **Deregister-failure surfacing** (`BackupPage`): a claimed account that can't reach the server on
     erase gets a "Couldn't release your username" warning (Erase anyway / cancel-and-retry) instead of a
     silent orphan.
   - ✅ **Mandatory username at onboarding** (sync builds): `LetUsKnowYouScreen` requires a valid handle when
     `hasEntitlement('sync')`. (The server _claim_ itself stays on Profile — reworked in F3.)
   - ✅ **Backup nudge after claim** (`ProfilePage`): a claimed account with no OFF-device backup
     (`getBackupTarget()` not `google-drive`/`icloud`) sees a warning banner → "Set up backup".
   - ✅ **Account-start flow** (mockup `docs/mockups/proposals/onboarding-account-start-v2.html`, approved):
     Preview Dashboard "Set up my account" → **Screen A** `AccountStartScreen` (`/onboarding/start`, three
     cards: Start fresh / Restore / Reclaim) → tap a card → **Screen B** `AccountRecoveryScreen`
     (`/onboarding/account`, segmented tabs with that tab pre-selected). New tab → Let-us-know-you (+ seed);
     Restore tab → Drive/file `importBackup` (everything back, **no re-claim, no seed**); Reclaim tab → F3.
     (`RestoreAccountScreen`/`ReclaimAccountScreen` consolidated into Screen B and removed.)
   - ✅ **Handle recovery after restore** (`IdentityReconciler` in `AuthGuard`, `ChooseHandleScreen` ④):
     Restore sets `RECONCILE_FLAG`; post-unlock the reconciler runs `/whoami` → if the account was
     deregistered it re-registers the restored identity → if the old handle is now taken it surfaces ④
     (pick a new handle; data/keys untouched). Covers the erased-with-backup case.
   - ⏸ _(Deferred stretch)_ groups-side cleanup on account delete — cross-worker design (auth→groups call
     vs groups GC); revisit with F3/F4.
3. **F3 — Username + passphrase reclaim (scheme A: Ed25519 challenge)** (recovery surface #2 — WhatsApp parity) — ✅ _(build + worker type-check + 408 tests green; browser + live-worker verification pending)_
   - ✅ Auth worker: per-account recovery verifier (Ed25519 **public** key + salt; never the passphrase /
     no password-equivalent). `POST /recover/start` (salt + nonce) + `POST /recover/finish` (verify signed
     nonce → bind new device under the **existing** `userId`). Migration `0003_recovery.sql`.
   - ✅ Client crypto: `core/identity/recovery.ts` — deterministic Ed25519 keypair from
     `PBKDF2(passphrase, salt)`; sign/verify round-trip unit-tested.
   - ✅ Verifier uploaded at claim (`claim.ts` ← `securityManager.getRecoveryVerifier()`); derived at
     `initialize()`, re-derived on `changePassphrase` + re-uploaded (`ChangePassphrasePage`).
   - ✅ `reclaimAccount()` + `ReclaimAccountScreen` (`/onboarding/reclaim`, from the restore screen):
     fresh vault → prove ownership → adopt the old `userId`. Wipes the half-vault on failure.
   - ✅ `userId` stays internal + stable; username = public handle mapped to it.
   - ⏸ _(Deferred)_ **group recovery after reclaim** — reclaim restores identity + server-side membership,
     but the client has no local group mirror and there's **no "list my groups" server call** yet; plus
     group _keys_ need a co-member re-grant. Both extend Track E (list-my-groups sync + auto re-grant) and
     are tracked there / as an F3 follow-up. Personal data still needs a backup.
4. **F4 — Device pairing (Flow 2 / QR)** (recovery surface #3)
   - Worker: small DMK-grant relay (post + fetch-once), reuse signed `POST /device`.
   - Client: pairing handshake UX (B shows code/QR → A registers B + grants DMK → B unwraps, becomes a
     full device). Recommended: **server-relayed grant** (one code + poll) over two-QR offline exchange.
   - Personal data on B pulled from the user's own Drive backup post-pair; group data live-syncs.
5. **F5 — Verification** of the full loop (claim → pair second device → erase → reclaim via backup AND via
   username+passphrase).

**Deferred (separate, costed decision):** server-side E2EE storage of the encrypted DMK + personal data
(to restore _everything_ from just username+passphrase, no user cloud) — reverses own-Drive Model B and
reopens the personal-data storage-cost question. Phase 2-ish.

Each step: build-green + behind the `sync` gate so `main` stays shippable; commit per step (ask first).

---

## Open questions / decisions

- **Pairing transport:** server-relayed DMK grant (recommended, simplest UX) vs fully-offline two-QR
  exchange (no server touch, clunkier). _Leaning server-relayed._
- **Personal data onto a paired device:** rely on the user's own Drive restore (simplest, Model B) vs a
  one-time A→B encrypted data push. _Leaning Drive restore._
- **Reclaim UX when a handle is orphaned-but-yours:** a recover/`whoami`-by-proof endpoint so the UI can
  distinguish "yours" from "taken" and guide into restore/pairing (item #3 in the recovery doc). SRP reclaim
  (F3) is the proof mechanism.
- **SRP verifier details (F3):** which SRP variant / KDF params; independent from the DMK-wrapping
  derivation (don't reuse); rate-limiting + lockout policy on reclaim attempts; what a forgotten passphrase
  means (permanent handle lockout — acceptable? add a warning at claim time).
- **Server-side E2EE data blob (deferred):** worth it vs relying on the user's own Drive? Only decision that
  would let username+passphrase restore _personal data_ with no user cloud — but costs storage + a
  (ciphertext-only) breach surface.

---

## Progress Log

- **2026-07-04 — F1 phantom-claim bug fixed.** Root cause: [`seedGroupFixtures.ts`](../../src/core/db/seedGroupFixtures.ts)
  stamped a fake `deviceId: 'demo-device'` + `username: 'aarav_s'` onto the profile, so `claimed`
  (`deviceId && username`) read true without a server registration or device keys — Create/Join surfaced
  but every signed call failed (`NotClaimedError`). After a reset+reseed this left the app "claimed but
  broken." Fix: (a) demo no longer writes a fake identity, so `deviceId` is set _only_ by a real
  `claimAccount()` → `claimed` is honest with no extra logic; (b) [`HomeGroupsCard.tsx`](../../src/features/groups/HomeGroupsCard.tsx)
  now surfaces groups on existence (not `claimed`) for viewing, and its New/Join becomes a "Claim to
  create" link to Profile when unclaimed. Build green. **User-verified:** reset → onboarding correctly
  shows "Not claimed", claiming a username works.
- **2026-07-04 — Lifecycle traced & documented.** Confirmed onboarding mints a fresh `userId`, and the
  deployed `penny-auth` worker has a live `DELETE /account` (401 unauth). Documented erase + reclaim
  behavior (table above); identified the silent deregister-failure gap as the top recovery-hardening item.
- **2026-07-04 — Manual/devtools-wipe case documented.** User reset via console
  (`localStorage.clear()` + `indexedDB.deleteDatabase('penny')` + reload) after claiming `hem2182` +
  creating a "Sharma's Family" group, then re-onboarded with the same details. Traced the outcome against
  the deployed worker: because the manual wipe skips `deregisterAccount()`, `hem2182` is still held by the
  old `userId`; onboarding mints a new `userId`; clicking **Claim** → `POST /register` →
  worker [`index.ts:96-97`](../../workers/auth/src/index.ts#L96-L97) `holder !== userId` → **409** →
  `UsernameTakenError` → _"Already taken… restore a backup…"_ (verified logic, not yet run live). The
  group is orphaned server-side under the old userId (new account can't decrypt it). Added a
  "Manual / devtools wipe" row + retry/orphan notes to the lifecycle table. This is the common dev-testing
  path, so it reinforces F2 (recovery hardening) and argues for a **dev-only "deregister + wipe" helper**
  so testers don't keep orphaning handles. No code changed.
- **2026-07-04 — Uninstall/reinstall = the same orphaned state (key realization).** The manual wipe is
  equivalent to a real user **uninstalling → reinstalling**, because there is **no PWA on-uninstall hook**,
  so `deregisterAccount()` never fires on uninstall either. Worse, **iOS evicts standalone-PWA IndexedDB
  after ~7 days of non-use** with no user action. Both drop a normal user into the orphaned-handle state
  with zero friction/consent, and the only server-side cleanup path ("Erase everything") is one they won't
  take. Added "Uninstall → reinstall" + "iOS 7-day eviction" rows to the lifecycle table and a callout that
  **recovery (F2/F3) is load-bearing for the whole account model** — argues for raising F2/F3 priority and
  making backup setup prominent/near-default right after a claim. No code changed.
- **2026-07-04 — Identity & recovery design settled (SRP; auth≠decryption).** WhatsApp-parity discussion:
  WhatsApp reclaims a handle via a **verified side-channel (OTP)** = its proof of ownership; Penny has none
  (no phone/OTP by design). Chosen proof: **server-verified username+passphrase (SRP)** — the deferred
  "server auth," not phone/OTP. **Key correction captured:** SRP is _authentication_, not _decryption_ — it
  recovers identity + group _membership_, but **cannot** recover encryption keys the server never held.
  Group _history_ → co-member re-grant (usual) or backup; personal _data_ → backup only (DMK is random, no
  co-holder). Same limits as WhatsApp. `userId` stays as the internal stable anchor; username = recoverable
  public handle mapped to it (rename = relabel). Restoring _all_ data from just username+passphrase would
  require server-side E2EE storage of the DMK+data — reverses own-Drive Model B + reopens storage cost →
  deferred. Added "Identity & recovery design" section; restructured the plan into three recovery surfaces
  (restore-on-reinstall F2, SRP reclaim F3, device pairing F4); updated inventory + open questions. No code
  changed.
- **2026-07-04 — F2 implemented (recovery hardening + restore-on-reinstall).** Four changes, build + 404
  tests green (browser verification pending): (a) **deregister-failure surfacing** — `BackupPage.handleReset`
  now checks `getClaimState()`, and on a claimed account whose `deregisterAccount()` throws it shows a
  "Couldn't release your username" dialog (Erase anyway / cancel-to-retry) instead of silently orphaning it;
  (b) **mandatory username** at onboarding on sync builds (`LetUsKnowYouScreen`, gated on
  `hasEntitlement('sync')`); (c) **post-claim backup nudge** (`ProfilePage`) shown when a claimed account
  has no off-device backup target; (d) **restore-on-reinstall** — new `RestoreAccountScreen`
  (`/onboarding/restore`, Drive or file via `importBackup`) reachable from a "Been here before?" link on
  `PrivacyPromiseScreen`; after restore it hard-navs to `/app` so the AuthGuard/SessionGate shows unlock.
  Deferred the groups-side account-delete cleanup (stretch) pending a cross-worker design pass. Next: F3 (SRP).
- **2026-07-04 — F3 implemented (passphrase reclaim; scheme A — Ed25519 challenge).** User chose scheme A
  over textbook SRP-6a (Web-Crypto-native, no hand-rolled modexp, same security). Build + worker
  type-check + 408 tests green (incl. 4 new Ed25519 round-trip tests). **Worker:** migration
  `0003_recovery.sql` adds `recovery_salt` + `recovery_pubkey`; `upsertUser` COALESCEs them (a plain
  re-register never wipes a verifier); `/register` stores them; new `POST /recover/start`
  (returns salt + single-use nonce) + `POST /recover/finish` (verifies an Ed25519 signature over
  `recover\\n{username}\\n{nonce}`, then binds the new device under the existing `userId`); rate-limited;
  no handle enumeration (unknown vs unrecoverable both 404). **Client:** `core/identity/recovery.ts`
  derives a deterministic Ed25519 keypair from `PBKDF2(passphrase, salt)` (600k, independent of the DMK
  KDF); `securityManager.initialize`/`changePassphrase` derive + store the verifier; `claim.ts` uploads it
  and adds `reclaimAccount()`; `ReclaimAccountScreen` (`/onboarding/reclaim`, linked from the restore
  screen) sets up a fresh vault → proves ownership → adopts the old `userId`, wiping the half-vault on
  failure. **Security properties:** server stores only a public key (DB-leak/replay safe); proof binds
  username+nonce; offline brute-force bounded by the 600k KDF. **Deferred:** group recovery after reclaim
  (no "list my groups" call yet + key re-grant) — extends Track E. **Still to do before shipping:** deploy
  the auth worker + apply migration `0003`; browser + live-worker verification (F5).
- **2026-07-04 — Onboarding flow rework (F2/F3 finalize).** Per user feedback, moved the returning-user
  entry OFF the Privacy-Promise screen and made it a proper branch **after the Preview Dashboard**
  (`SimulatedDashboardScreen`): "Set up my account" (new user → Let-us-know-you → Set-up-vault → seed) vs
  "Already have an account? Restore or reclaim it" → restore screen. Rationale: the Let-us-know-you +
  Set-up-vault + seed screens are new-user-only; a restore brings profile/data/groups back from the backup
  (no seed, no re-claim), and reclaim (no backup) is the passphrase path off the restore screen. Fixed the
  restore screen's back target to the preview. Build + lint green.
- **2026-07-04 — Account-start flow v2 built (mockup approved).** Two mockups
  (`onboarding-account-start-v1/v2.html`); user approved v2. Implemented the full A→B→④ flow: **Screen A**
  `AccountStartScreen` (three cards) → **Screen B** `AccountRecoveryScreen` (segmented New/Restore/Reclaim
  tabs, pre-selected from the tapped card; consolidates + replaces the standalone Restore/Reclaim screens)
  → **Screen ④** `ChooseHandleScreen` for the "handle taken after a deregistered account was restored"
  case, driven by `IdentityReconciler` (mounted in `AuthGuard`, runs post-unlock off `RECONCILE_FLAG`:
  `/whoami` → re-register restored identity → on `UsernameTakenError` show ④). New-card copy now names the
  erased-with-nothing-to-restore case. Scenario matrix (reinstall / no-backup / erased+backup /
  erased+no-backup) all covered. Preview CTA now → Screen A. Build + repo-lint + 408 tests green; browser
  verification pending.
- **2026-07-04 — Claim reactivity bug fixed + claim-at-onboarding.** User reported the Home Groups card
  still said "Claim to create" after a successful Profile claim (server `penny_auth` row confirmed). Root
  cause: `useRepository` is a one-shot load (not live), so `GroupContext` kept the stale pre-claim profile
  (no `deviceId`) → `claimed` false. Fix: `claimAccount`/`reclaimAccount` now dispatch a
  `penny-profile-updated` event (mirrors `penny-events-updated`), and `GroupContext` reloads the profile +
  groups on it → the card/switcher update live after an in-app claim. Also: **new users now claim at
  onboarding** (`SetupCredentialsScreen`, sync builds, best-effort) so a fresh account is real immediately,
  with a **username availability check** on `LetUsKnowYouScreen` to avoid a taken handle failing the claim.
  Build + repo-lint + 408 tests green.
- **2026-07-04 — Backup export "Maximum call stack size exceeded" fixed.** `bufferToBase64` in
  `backupManager.ts` spread the entire encrypted-DB ciphertext into `String.fromCharCode(...)`, overflowing
  the argument stack on a real (non-empty) vault — blocking export, and therefore the restore-flow test.
  Now chunked (32KB). Import side was already loop-based. Build + 408 tests green.
