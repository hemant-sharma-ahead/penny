# Phase 1.5 — Track E: Groups & Household OS (DETAILED)

> **Status:** 🚧 In progress. **E1 ✅ (worker + group crypto + client wiring)** — `workers/groups/`
> (D1 + R2 + KV, five tables, signed + membership-checked routes; device signing/wrapping keys read from
> the auth D1), `src/core/groups/keys.ts` (Group Key gen + ECDH-wrapped grants + event enc/dec via Track B
> `deriveSharedWrappingKey`), `src/core/groups/groupsClient.ts` (`signedFetch`-based, `GROUPS_BASE`), Dexie
> v9 (`groups`/`group_members`/`group_events`). Not yet deployed. **Next: E2** (create/invite/join/membership).
> This is the **last feature track** of Phase 1.5, followed by the **Stage F closeout** (below). Sub-phases
> ship one at a time (E1→E5), each behind the `sync` entitlement so `main` stays shippable.
> Authoritative per-track status: [`docs/MILESTONES.md`](../MILESTONES.md) / [`docs/ROADMAP.md`](../ROADMAP.md).
> Parent plan: [`phase-1.5-groups-household-os.md`](phase-1.5-groups-household-os.md) → "Track E".

## Context

Phase 1.5's foundations are done: Track 1 (pairwise IOU ledger), A (API proxy), B (device keypairs +
`mergeBundle` + ECDH `deriveSharedWrappingKey`), C (auth worker + `signedFetch` + claim), D
(Drive/iCloud sync). **Track E** turns Penny into a shared **Household OS**: create groups (Family, Trip,
Roommates…), invite members, split shared expenses N-ways, see per-group dashboards, and settle up — all
end-to-end encrypted, Model B (server relays ciphertext only). After Track E, only the Stage F closeout
remains before Phase 1.5 is done.

This is large, so it ships as **sequenced sub-phases E1→E5**, each independently testable and committable.

## Decisions locked (review these)

- **Reuse & extend the IOU, don't rewrite.** The pairwise personal ledger (`iou/ledger.ts`,
  `Person`/`LedgerEntry`, `linkedMemberId`/`remoteId` hooks) stays. Groups add an **event-sourced shared
  ledger** for N-party splits; settling a group balance can reflect into your personal IOU + a real
  account txn (the existing settle-up-without-payment linkage).
- **Split is first-class at creation:** a dedicated **shared-expense composer** captures payer +
  participants (subset) + method (equal / unequal / percent / shares) in one step — never "create then
  override."
- **Trip ↔ group:** an Event/vacation can be **linked to a group** (`linkedGroupId`). While active, the
  Add flow opens the group composer prefilled with smart defaults (that group, all members, equal split),
  which the user adjusts inline before saving.
- **Join history:** a **per-group owner setting** (`historyVisibility: 'full' | 'from_join'`), enforced
  via key-epoch grants.
- **Settle & freeze:** explicit **"Settle & close"** (owner/admin) → shared records become read-only
  archive; **reopenable**.
- **Cash guard:** **soft, non-blocking warning** when an expense / IOU-linked txn would push a **cash**
  account below ₹0; **fix the seed** so demo cash never goes negative.
- **Gating:** groups sit behind the `sync` entitlement (dark) + a claimed account (Track C). Personal
  app unaffected when off.

---

## Data model

**Server (new `workers/groups/` worker — mirrors the Track A/C template; D1 + R2 + KV).**

```sql
groups(group_id PK, type, enc_name, owner_id, key_epoch, history_visibility, status, created_at, updated_at)
group_members(group_id, user_id, role, status, joined_at, left_at, PK(group_id,user_id))
invites(token_hash PK, group_id, role, expires_at, max_uses, uses, revoked, created_by)
group_key_grants(group_id, user_id, key_epoch, wrapped_key, PK(group_id,user_id,key_epoch))
group_events(group_id, seq, event_id, author_id, key_epoch, r2_key, lamport, PK(group_id,seq))
```

R2: `gevent/{group_id}/{seq}` = `AES-GCM(GroupKey_epoch, eventJson)` — ciphertext only.
All endpoints authorized by `signedFetch`'s signed challenge **+ a membership check**.

**Client (new encrypted Dexie stores, schema v9 — id-only, like the Track B stores):**

- `groups {id, type, name, role, status:'active'|'closed', ownerId, keyEpoch, historyVisibility, joinedAt, …}`
  — the local decrypted mirror of groups the user belongs to.
- `group_members {id: '${groupId}:${userId}', groupId, userId, displayName, role:'owner'|'admin'|'member',
status:'active'|'left'|'muted', linkedPersonId?, joinedAt, leftAt?}` — `linkedPersonId` bridges a member
  to a local `Person` (reuses Track 1).
- `group_events {id: eventId, groupId, seq?, lamport, authorId, keyEpoch, type, payload, updatedAt, …}`
  — the **append-only shared ledger** (local mirror of R2). `type`: `shared_expense | expense_edit |
expense_delete | settlement | member_joined | member_left | group_closed | group_reopened`. Balances are
  **derived by folding events** (event-sourced projection), never stored.
- `GroupKey` (exists, Track B) holds the per-epoch AES key; `sync_cursor` scope `group:${groupId}` tracks
  the last-synced `seq`.

`Expense`/`Goal` gain `shareWith?: string[]` (group ids) for the personal→group per-item share path.

---

## Architecture decision (E1): cross-worker device-key lookup via `AUTH_DB`

**Decision (2026-07-01, approved).** The groups worker (`penny-groups`) reads the auth worker's D1
`devices` table through a **second, read-only D1 binding, `AUTH_DB`**, to (a) verify a request's device
signature and (b) fetch a member's ECDH wrapping public key when relaying a key-grant. It issues its
**own** `/challenge` nonces in its **own** KV; it never writes `AUTH_DB`.

**Why this is needed.** Every group route is authenticated by the same signed challenge as Track C, which
requires the caller's **device signing public key** — and that key lives only in the auth worker's
`devices` table (Track C, Model B). Grants additionally need the recipient's **wrapping public key**, also
in `devices`. So the groups worker must reach identity data it does not own.

**Alternatives considered, and why not (for now):**

| Option                                                                 | Why not chosen                                                                                                                                                                                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. One shared D1** (put group tables in `penny_auth`)                | Couples two domains into one schema, one migration history, one blast radius. Harder to reason about, back up, or split later. We want group data (which can grow large: events) isolated from small, sensitive identity metadata. |
| **B. Service binding / internal `fetch`** groups → auth to verify     | Adds a network hop + a second failure mode on every request, and needs a secured internal "verify device" endpoint. More moving parts than a DB read. Viable later if the workers must live in separate accounts/regions.        |
| **C. Denormalize** — copy device keys into the groups D1 at claim     | Two sources of truth for identity; revocation + re-key must now fan out and stay consistent. Silent staleness = an auth bug. Rejected.                                                                                            |
| **D. Trust a client-supplied device pubkey (TOFU)**                    | Defeats server-verified identity — anyone could mint a key. A no-go for the auth boundary.                                                                                                                                        |

**Chosen: `AUTH_DB` read binding.** D1 databases can be bound to multiple Workers, so this is a
one-line config with no runtime hop and a **single source of truth** for identity (revocation is always
respected because we read the live `devices` row).

**Complications / things to watch (the reason this record exists):**

1. **Schema coupling.** The groups worker now depends on these `devices` columns as a contract:
   `device_id, user_id, signing_key, wrapping_key, revoked_at`. A rename/drop in the auth worker breaks
   groups. Treat those columns as a shared interface; changes to them require touching both workers.
2. **Migration ownership.** Only the **auth** worker owns/writes `penny_auth`. The groups worker must
   never run migrations against `AUTH_DB` — its own migrations target `penny_groups` only.
3. **Read-only is by convention, not enforced.** D1 has no read-only binding mode. The invariant is kept
   by code review + the fact the groups worker has zero write statements against `AUTH_DB`
   (`groupsStore.ts` only `SELECT`s from it: `getDeviceSigningKey`, `getUserWrappingKey`).
4. **No cross-DB joins.** D1 can't join across the two databases, so the members list does N per-member
   wrapping-key lookups. Fine at household scale; revisit (batch/`IN`, or cache) if groups get large.
5. **Per-env wiring.** Each env (`dev`/`staging`/`production`) must bind the **matching** `penny_auth`
   database id in `wrangler.toml` — a mismatch would verify against the wrong identity store.
6. **Separate nonce KVs are deliberate.** The groups worker validates its own challenges; nonces are not
   shared with the auth worker. This keeps the workers independent at the cost of one extra `/challenge`
   round-trip when a client talks to both.

**Revisit triggers.** Move to **Option B (service binding / internal verify endpoint)** if we ever need
the workers in separate Cloudflare accounts/regions, a hard identity/data isolation boundary, or if the
`devices` read pattern becomes a hotspot. Until any of those, the read binding is the simplest correct
design.

---

## Sub-phases

### E1 — Groups worker + group crypto (server + key exchange) ✅

> **Done (not deployed).** `workers/groups/` mirrors the Track C template — `migrations/0001_init.sql`
> (groups, group_members, invites, group_key_grants, group_events), signed + membership/role-checked routes
> in `src/index.ts` (create/get group · invite create/redeem/revoke · members + member changes · grant relay
> + fetch · event append→R2/fetch · close/reopen), device signing/wrapping-key lookup via the read-only
> `AUTH_DB` binding, own KV `/challenge`. Client: `src/core/groups/keys.ts` (Group Key gen, `wrapGroupKeyFor`/
> `unwrapGroupKey` grants, `encryptForGroup`/`decryptFromGroup`), `src/core/groups/groupsClient.ts`,
> `GROUPS_BASE` + a `base` param on `signedFetch`. Dexie v9 stores + repos + BACKUP_STORES. Tests:
> `tests/worker/groups.test.ts` + `tests/groups/keys.test.ts`. Setup/deploy steps in `workers/groups/README.md`.

- **`workers/groups/`** (clone Track C template): D1 migration for the five tables; endpoints —
  `POST /group` (create), `POST /invite` / `POST /invite/redeem` / `POST /invite/revoke`,
  `GET /group/:id/members` + membership CRUD, `POST /group/:id/grant` (relay ciphertext key-grants),
  `POST /group/:id/events` (append) + `GET /group/:id/events?since=seq` (fetch). Signed + membership-checked.
  Invite stores only `SHA-256(secret)` + TTL + `max_uses`; the raw secret lives only in the link/QR; the
  Group Key is never in the invite. Reuse `lib/auth.ts` verification + `ratelimit.ts`.
- **`src/core/groups/keys.ts`** — generate a group AES-256 key (`engine.generateMasterKey`), wrap it to a
  member's ECDH wrapping public key via `deriveSharedWrappingKey` (Track B) → a `group_key_grants` row;
  unwrap on redeem. Epoch bump + re-wrap-to-remaining on leave (rotation); a joiner gets grants for
  epochs per `historyVisibility` (`full` → all prior epochs; `from_join` → current epoch onward).
- Client `src/core/groups/groupsClient.ts` — `signedFetch`-based calls for the above.

### E2 — Create / invite / join / membership ✅ (service layer)

> **Done (service + worker; UI wiring lands in E4 with the context switcher).** `src/core/groups/
> groupsService.ts` orchestrates worker + crypto + local mirror: `createGroup` (generate key → encrypt
> name → server create → persist key + local `groups`/owner `group_members`), `createInvite`/`buildJoinLink`/
> `parseJoinSecret` (secret in link, only `SHA-256` on the server), `redeemInvite` (join + local mirror,
> `awaitingKey` until the grant arrives), `syncGroupKeys` (pull grants → unwrap → decrypt name),
> `grantKeysToMembers` (admin wraps the key to every active member per history-visibility),
> `setMemberRole`/`leaveGroup`/`removeMemberAndRotate`/`rotateGroupKey`. New worker endpoint
> `POST /group/:id/rotate` (epoch bump + re-encrypt name on leave). Tests: `tests/groups/groupsService.test.ts`
> (name is ciphertext on the wire; invite sends only the hash; redeem awaits key; rotation re-keys).

- **Create group:** name + type (Family/Trip/Roommates/Other) + `historyVisibility` → server `create`,
  generate + self-grant the Group Key, write local `groups` + owner `group_members`.
- **Invite:** generate `secret` → link/QR (`https://app/join#<groupId>.<secret>`); server stores
  `SHA-256(secret)`. **Redeem:** open link → show group name → join → upload wrapping public key → an
  admin (or owner, async) wraps the Group Key into a grant → member pulls + unwraps.
- **Membership changes:** roles (owner/admin/member), **leave**, **mute** (local hide), owner transfer; a
  member can change their own status (leave/mute); admins manage others. Leaving → key rotation so they
  can't read new events.

### E3 — N-party split engine (pure) + shared-expense composer 🚧 (split engine ✅)

> **`split.ts` done** (pure, 13 tests): `computeShares` (equal/unequal/percent/shares, integer-paise,
> always reconciles), `foldGroupBalances` (event-sourced net per member; edits supersede, deletes
> tombstone, settlements move money), `whoOwesWhom` (greedy minimal transfers). Composer + settle-up UI
> land with the group surfaces in E4.

- **`src/core/groups/split.ts`** (pure, unit-tested — generalizes `iou/ledger.ts`):
  `computeShares(total, method, participants)` for **equal / unequal(exact) / percent / shares** (validates
  the parts sum to the total), `foldGroupBalances(events)` → net per member, `whoOwesWhom(balances)` →
  minimal pairwise transfers (simple greedy settle-up; "simplify debts").
- **Shared-expense composer** (`src/features/groups/SharedExpenseForm.tsx`) — the first-class add flow:
  amount · description · category · date · **who paid** (default you) · **participants** (multi-select
  members, default all) · **split method** with a live per-member breakdown that must reconcile to the
  total. Saving appends a `shared_expense` event (+ optional local account debit for the payer so their
  own balances stay honest — settle-up-without-payment linkage). Edit/delete append `expense_edit`/
  `expense_delete` (tombstone) events. **No post-hoc override** — split is set here.
- **Settle up** (`SettleUpGroupModal`): pick a counterpart member + amount → `settlement` event; optionally
  records a linked income/transfer locally (reuse `reconcileLinkedTxn`) and/or the personal IOU via
  `linkedPersonId`. No UPI VPA, no payee QR (unchanged privacy stance).

### E4 — Group sync + context switcher + dashboards + settle/close 🚧 (sync engine ✅)

> **Sync engine done** (`src/core/groups/groupSync.ts`, 4 tests): `appendGroupEvent` (encrypt payload →
> local event → push), `pushPending` (encrypt + append un-synced events, record server seq), `pullGroupEvents`
> (fetch since cursor → decrypt with epoch key → **LWW-on-updatedAt** merge, skip epochs without a grant),
> `syncGroup`, plus `groupBalances` (folds via `split.ts`) and `groupFeed` (tombstone-aware). Cursor scope
> `group:${groupId}`.
>
> **E4b done (read UI):** `src/context/GroupContext.tsx` (`GroupProvider`/`useGroupContext` — active
> Personal|group scope, persisted), `features/groups/ContextSwitcher.tsx` (header context bar + menu,
> gated on `hasEntitlement('sync')`), `CreateGroupModal`/`JoinGroupModal` (wire `groupsService`),
> `GroupDashboard` (your balance, members + per-member balances, shared-expense feed; best-effort
> `syncGroup` on open). Mounted in `AppShell`; Home re-scopes to the dashboard when a group is active.
> **Remaining E4c (write UI, next): shared-expense composer (wires `split.ts`) + settle-up + members/invite
> management + settle & close** — visual surfaces, reviewed against the deployed worker (no RTL in tests).

- **Group event sync** (`src/core/groups/groupSync.ts`) — mirrors the Track D engine pattern: append local
  events to R2 via the worker, pull `events?since=cursor.seq`, decrypt with the epoch Group Key, fold into
  local `group_events`; **conflict model = server `seq` total order + client `lamport` + per-entity LWW on
  `updatedAt` + delete tombstones** (reuses the Track-4 activity-log ideas). Wire into the existing
  `SyncProvider` lifecycle (runs alongside personal backup when unlocked + entitled + claimed).
- **Context switcher** — a pill in the `AppShell` header ("Personal ▾") opening a menu: Personal + each
  group + "Create / Join". Switching re-scopes Home/Expenses/Goals to that group (a `GroupContext`
  provider). No 6th nav tab.
- **Group dashboard** — group net ("You're owed ₹X / You owe ₹Y"), member list w/ per-member balance,
  shared-expense feed, Add / Settle-up, per-group activity (reuse Timeline), settings (invite, members,
  history-visibility, leave). **Settle & close:** when net ≈ 0, owner/admin can close → events frozen
  read-only (archive banner); **reopen** re-enables activity. Closed-group edits are blocked in the UI +
  guarded in the event appender.

### E5 — Trip↔group linkage + per-item share + cash guard + seed

- **Event→group link:** add `linkedGroupId?` to `ActiveEvent` (`EventModeContext`). While a linked event is
  active, the **Add** action opens the **group composer** prefilled (that group · all members · equal
  split), adjustable inline before saving; the hashtag is still applied. A personal purchase during the
  trip is added by switching to Personal context (or a "keep personal" toggle in the composer).
- **Per-item share selector:** in the personal `ExpenseForm`/goal form, an optional "Share with" group
  picker (default Personal) sets `shareWith` — the lightweight path for sharing a one-off without the full
  composer (even split among all members).
- **Cash-negative guard:** `balanceCalculator.ts` gains `projectedBalance(accountId, …, candidateTxn)`;
  `ExpenseForm` + the IOU/settle linked-txn flows show a **soft warning banner** when a cash account would
  go < 0 ("This makes Cash negative — did you miss a cash withdrawal or pick the wrong account?"). Save is
  still allowed.
- **Seed fix:** raise the demo cash opening balance and/or add a cash-withdrawal transfer so the Leh-Ladakh
  trip's cash spends never drive `demo-acc-cash` negative; add a couple of small **group** demo fixtures
  (a Trip group + a Family group with shared expenses) so the feature demos richly.

---

## Key files

- **New:** `workers/groups/` (worker); `src/core/groups/` (`groupsClient`, `keys`, `split`, `groupSync`,
  `GroupContext`); `src/features/groups/` (`GroupsHome`, `SharedExpenseForm`, `SettleUpGroupModal`,
  `GroupSettings`, `CreateGroupModal`, `JoinGroupModal`, `ContextSwitcher`).
- **Extend:** `db/schema.ts` (v9: `groups`, `group_members`, `group_events`), `db/types/index.ts`,
  `db/repositories.ts`, `BACKUP_STORES`; `EventModeContext.tsx` (`linkedGroupId`); `ExpenseForm.tsx` +
  `useExpenses.ts` (`shareWith` + cash warning); `accounts/balanceCalculator.ts`; `AppShell.tsx` (switcher);
  `entitlement.ts` (reuse `sync`); `seedDemoData.ts`.
- **Reuse:** `signedFetch`, `deriveSharedWrappingKey`, `mergeBundle` patterns, `iou/ledger.ts`,
  `reconcileLinkedTxn`, Timeline/activity log, the worker template + `lib/auth.ts`.

## Verification

- **Pure unit tests:** `split.ts` (equal/unequal/percent/shares reconcile; `foldGroupBalances`;
  `whoOwesWhom` minimal transfers), key wrap/unwrap round-trip + rotation grants, event-fold projection +
  LWW/tombstone conflict resolution, `projectedBalance`/cash-negative detection, invite token hashing.
- **Worker tests** (`tests/worker/groups.*`): pure route/auth/membership logic (mirrors `tests/worker/auth`).
- **Client tests:** create→invite→join→share→settle→close state machine with `signedFetch`/worker mocked;
  history-visibility grant gating; seed loads with cash never negative.
- **Full gate** green (`npm run test`, incl. `tests/pii-gate`), `npm run lint`, `tsc --noEmit`, worker
  `type-check`.
- **Manual (user-run; needs the deployed groups worker + auth):** create a Trip group, invite via QR on a
  2nd same-DMK profile, add an unequal split, settle, close → frozen; link a vacation event to the group and
  confirm the Add flow opens the composer prefilled; trigger the cash warning.

## Not in Track E itself (Phase 1.5 **closeout** candidates — Stage F, not Phase 2)

Native (Capacitor) shell that **activates iCloud**; realtime push (during E, events sync on the Track-D
cadence); cross-currency splits; receipts inside group events; merging per-group balances into a
**combined household net-worth** view. These are revisited in Stage F — part of Phase 1.5, not deferred.

## Sequencing

Implement + commit **per sub-phase** (E1→E5), each behind the `sync` gate so `main` stays shippable. E3's
pure `split.ts` can land early (no backend) to de-risk the math; the worker (E1) is the critical path for E2/E4.

## Stage F — Phase 1.5 Closeout (after Track E, before we call Phase 1.5 done)

Track E is the last _feature_ track, but Phase 1.5 isn't closed until we harden and polish the whole thing.
Stage F is an explicit closeout (its detailed task list is drawn up **after** Track E lands, informed by what
we actually find, and tracked as its own plan doc then):

1. **Full end-to-end testing of every Phase 1.5 feature** — Tracks 1 (IOU), A (proxy), B (crypto),
   C (auth claim), D (backup+sync), E (groups) exercised together on the expanded seed. **Backup tested for
   real** (Google client id + CSP in place): manual export/import, auto-backup, Drive round-trip, multi-device
   merge, recover-from-Drive; plus group flows (create→invite→join→split→settle→close, leave + key rotation,
   history-visibility).
2. **UI fixes + simplify designs + design-consistency pass** across the new surfaces (context switcher, group
   dashboard, shared-expense composer, backup/sync + claim UI) — align with design tokens, the
   `Modal`/no-bottom-sheet rules, status colors, and the shared component library; remove rough edges.
3. **Activate iCloud** via the native (Capacitor) bring-up (lights up the dormant Track D provider).
4. **Weigh the closeout candidates** above (realtime push, cross-currency, group receipts, combined household
   net worth) — build the ones worth it.
5. **A planning conversation** (deliberate checkpoint) on what else Phase 1.5 should include before we close it
   — new additions, improvements, cross-app design consistency — then a final polish/QA sweep.

---

## Review notes

_Add inline comments/edits below (or throughout) during review; we iterate here until approved, then flip the
Status banner and begin E1._
