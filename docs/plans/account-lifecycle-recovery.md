# Account Lifecycle & Recovery (plan)

> **Status:** 🚧 Deregister-on-erase + inactivity GC + claim-error UX = implemented (auth worker migration
> `0002`). **Account recovery is now delivered under [Track F](phase-1.5-track-F-multi-device-recovery.md)** —
> restore-on-reinstall (F2) + passphrase reclaim (F3) are built; device pairing (F4) is next. **Read the
> Track F plan for the current recovery model + status; this doc remains the reference for the recovery
> *worker mechanics* (deregister, inactivity GC, TTL decisions).**
> Related: [`docs/BACKEND_STRATEGY.md`](../BACKEND_STRATEGY.md), Track C (auth), Track D (backup), Track F.

---

## Problem

Penny is Model B (server stores only identity metadata: `userId`, optional `username`, public keys — never
private keys or data). When a user **erases the app / resets** or **loses their device**, the server is left
with an **orphaned account**: a `users` row (holding the username) + `devices` that no live device can
authenticate as. The username is locked, and the client shows cryptic errors (`NotClaimedError` /
"username taken" when it's actually *your own* handle).

The server **cannot deterministically know** an account is orphaned — a silent account might be offline, on
another device, or about to restore a backup. So cleanup is **client-triggered (deterministic)** with a
**server inactivity backstop**, and getting an account *back* needs a **recovery** path (proof of ownership),
never username-alone (that'd be account takeover).

---

## Implemented (this session)

### 1. Deregister-on-erase (deterministic, consented)
- **Auth worker:** signed `DELETE /account` → `deleteAccount(userId)` deletes the user + all its devices
  (releases the username). ([`workers/auth/src/index.ts`](../../workers/auth/src/index.ts),
  [`authStore.ts`](../../workers/auth/src/authStore.ts))
- **Client:** `deregisterAccount()` ([`claim.ts`](../../src/core/identity/claim.ts)) is called from
  **"Erase everything"** (`BackupPage`) **before** `wipeAllData()` — while the device still holds its keys.
  Best-effort (ignored on failure; the GC is the backstop). The **failed-PIN security wipe does NOT
  deregister** (attacker scenario).

### 2. Inactivity GC (backstop for lost/broken devices)
- **`last_seen`** column (migration `0002_last_seen.sql`), **bumped on every signed request** in
  `authenticate()`.
- **Cron** (daily 03:00, `wrangler.toml [triggers]`) → `scheduled()` → `deleteStaleUsers(now − 365d)`
  deletes accounts (+ devices) with no authenticated activity for **`INACTIVE_TTL_DAYS = 365`**, reclaiming
  the username. Aligns with Model-B data-minimization.
- *Note:* only auth-worker signed requests bump `last_seen` (group requests hit the groups worker, which
  binds `AUTH_DB` read-only). The client should ping `/whoami` on launch for accurate liveness — **follow-up**.

### 3. Claim-error UX
- `useServerActionError` ([`src/features/groups/useServerActionError.ts`](../../src/features/groups/useServerActionError.ts)):
  any group/server action that hits `NotClaimedError` shows one friendly **"Claim your account to use
  groups & sharing"** prompt and routes to Profile (create/join/settle/members/composer wired).
- Reclaiming a taken handle now hints recovery: *"…if it's your own from another device, restore a backup."*

---

## Future (not built) — the real recovery flow

1. **Restore identity from backup (Track D).** The backup already carries `device_keys` + `profile`;
   restoring re-establishes the **same `userId` + keys** → the handle is yours again and re-claim is
   idempotent. Needs the restore path to actually re-import identity + verify against the server.
2. **Device pairing.** A device still signed into the account grants a **new** device the account identity
   (reuses the group key-grant/ECDH machinery from Track B). Lets you add a device without a backup.
3. **"It's your own account" recognition.** A recover/`whoami`-by-proof endpoint so the UI can tell an
   *orphaned-but-yours* handle from a genuinely-taken one, and guide into (1)/(2) instead of "taken".
4. **Group-side cleanup.** `DELETE /account` removes the auth user+devices only; `group_members`/
   `group_key_grants` in the groups D1 aren't cleaned (that user can't auth anyway) — add a groups-side GC
   or cross-worker cleanup.

---

## Decisions

- **TTL = 365 days** of no authenticated activity before GC (generous; a returning user within a year keeps
  their account by simply using it).
- **Deregister is best-effort** — never block/slow the erase on a network call; GC covers failures.
- **Security wipe ≠ deregister** — repeated-failed-PIN wipe keeps the server record (the person wiping may be
  an attacker, not the owner).
- **No username-only reclaim** — recovering an account always requires proof (backup/pairing), by design.
