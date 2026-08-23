# Groups (Household OS)

## What it is

A generalisation of the personal IOU ledger (see [`docs/features/iou.md`](iou.md)) to **N-party
shared expenses** — a Splitwise-style experience for a family, a trip, or roommates, built on the same
privacy-first, event-sourced foundation as the rest of Penny. A user can belong to multiple groups
simultaneously; each group is financially independent, and nothing is shared to a group unless the user
explicitly pushes it there. This is Phase 1.5 Track E; see
[`docs/plans/phase-1.5-track-E-groups.md`](../plans/phase-1.5-track-E-groups.md) for the original
detailed plan and [`docs/plans/real-device-testing-pass.md`](../plans/real-device-testing-pass.md)'s
Phase 3 for the 2026-08-18 redesign this doc mostly describes.

Groups require a **claimed username** (the Phase 1.5 opt-in identity upgrade) — an unclaimed user sees
groups they've been shown but a "Claim a username to use Groups" CTA in place of Create/Join.

## User-facing capabilities

- **Create a group** — pick a type (**Family**, **Trip**, **Roommates**, **Other**), a name, and a
  history-visibility setting (a new joiner sees **full** history or only **from the point they joined**).
- **Invite people** — generate a shareable invite link/QR (WhatsApp-friendly); redeeming it grants the
  joiner the group's encryption key and admits them.
- **Add a static (no-account) member** — a name-only placeholder (e.g. "Grandma") who participates in
  splits/balances but can't install the app or confirm anything themselves; a real member manages their
  share on their behalf. Shown with a "No account" badge.
- **Share an expense** — equal, unequal, percent, or by-shares split across any subset of members; a
  **Family**-type group defaults the split to just the person sharing it (Indian family spend is usually
  one-directional, not reciprocal) while Trip/Roommates default to splitting evenly across everyone.
- **Edit or delete your own shared expense** — the original recorder can correct or remove an entry they
  shared; another member instead gets **"Flag as not needed"**, which notifies the recorder (a lightweight
  request, not a unilateral removal) rather than editing/deleting someone else's entry directly. The
  recorder can **Keep** (dismiss the flag) or delete.
- **Settle up** — record a real repayment, or mark a balance **"Write off"** (never coming back — no
  money moved, distinct from a real settlement) with an **Undo write-off** available afterward.
- **Per-member balance view** — who owes whom, at a glance, on the group dashboard.
- **Delete a group** (creator only) — once every shared expense has been removed (zero non-deleted
  history) — irreversible, distinct from close/reopen (a status flip either the owner or an admin can do).
- **Leave / remove / change a member's role** — blocked server-side if it would leave the group with
  active members but **zero remaining admin/owner** (a 409 with an explanatory message), unless it's the
  lone remaining member leaving (nothing left to be "admin-less" for). **Leaving keeps the group's history
  on-device, read-only** (fixed 2026-08-23, see below) — it no longer deletes the local group and its
  event history the moment you leave.
- **Promote a personal IOU person to a group** — see [`docs/features/iou.md`](iou.md)'s
  `PromoteToGroupWizard.tsx` entry; the reverse direction (personal ledger → new Group) lives there since
  it's initiated from the IOU screen, not from Groups.
- Settled/closed groups keep their history visible but **immutable** — every edit/flag/delete action is
  disabled the moment a group's status isn't `active`. A group you've **left** behaves the same way
  (read-only, not gone) — see "Leaving a group" below.

> **Settle-up never touches money.** Same as personal IOU — Penny stores no UPI VPA and generates no
> payee QR; only the ledger entry (or write-off) is recorded.

## How it works

### Data model — local encrypted mirrors, event-sourced

Three DMK-encrypted Dexie stores (v9) mirror server-relayed, **ciphertext-only** (Model B) group data —
see [`docs/SCHEMA.md`](../SCHEMA.md) for the full field list:

- **`groups`** — a group the user belongs to; `role`/`status` are this user's own membership.
- **`group_members`** — one row per member, including `accountless` (static/placeholder marker) and the
  reserved `upgradedToUserId` upgrade hook (once a placeholder's real counterpart joins normally).
- **`group_events`** — the **append-only shared ledger**. Balances are never stored — they're **derived
  by folding events** (`core/groups/split.ts`'s `foldGroupBalances`), same principle as personal IOU's
  derived net balance.

Event types (`GroupEventType`): `shared_expense`, `expense_edit`, `expense_delete`, `expense_flag`,
`expense_flag_clear`, `settlement`, `settlement_void`, `member_joined`, `member_left`, `group_closed`,
`group_reopened`. An `expense_edit` reuses `shared_expense`'s exact payload shape (same `expenseId`) — no
schema needed for it; the fold engine's "latest wins" is a plain `Map` overwrite keyed by `expenseId`.

### Split engine

`core/groups/split.ts`'s `computeShares()` is a pure N-party split calculator (equal/unequal/percent/
shares) that works in integer paise internally and always reconciles exactly to the total (any rounding
remainder goes to the largest fractional shares, deterministically) — no split can leak or invent a paisa.
`foldGroupBalances()` folds every `shared_expense`/`settlement` (excluding any voided by a later
`settlement_void`) into a per-member net.

### The feed — dedup, flags, and write-offs

`groupSync.ts`'s `groupFeed()` builds the dashboard's chronological feed: one row per logical
`expenseId` (an edit supersedes the original at its **original** feed position, not jumped to "just now"
— a real bug found and fixed 2026-08-18, where an edit used to render as two separate rows) plus
settlement rows, newest first, excluding anything tombstoned by `expense_delete`.

`groupFlags()` folds pending "not needed" flags: an `expense_flag` is pending until a later
`expense_flag_clear` (Keep) or `expense_delete` (Delete) on the same `expenseId` resolves it; a fresh flag
re-opens even an already-cleared one. `groupVoidedSettlementIds()` tracks which `settlement.id`s a later
`settlement_void` has reversed, so the UI can hide an already-voided write-off's own undo action.

### Orphaned shared transactions — fixed

Deleting a personal `Expense` now emits `expense_delete` to every group it was shared to
(`notifyExpenseDeletedToGroups()` in `groupsService.ts`) — until 2026-08-18 this never happened, so
`group_events` kept a stale `shared_expense` referencing a transaction that no longer existed, forever.
Best-effort per group (a temporarily-unreachable group must never block the personal delete — the local
tombstone event is durably queued by `appendGroupEvent` regardless, resyncing whenever that group is next
opened).

### Leaving a group — read-only history, not deletion (fixed 2026-08-23)

`GroupStatus` gained a third value, `'left'`, alongside `'active'`/`'closed'`. `leaveGroup()`
(`groupsService.ts`) used to delete the local `groups` record and membership row immediately on leave —
`group_events` was left orphaned (unreachable once its owning `groups` record was gone), so the group and
its entire history vanished from the device the moment the user left. It now only deletes the caller's
own `group_members` row and sets `status: 'left'` on the group; the `groups` record and its `group_events`
survive untouched, so `GroupDashboard` can keep rendering everything that happened before, frozen.
`appendGroupEvent()` (`groupSync.ts`) also gives a status-aware error — "You left this group" vs. "Group is
closed" — instead of one generic message for both non-active states.

On `GroupDashboard`: a left group hides the settings gear entirely (nothing left to manage once your own
membership is gone — unlike `closed`, where the gear stays since reopening is still a real action), shows
a `Banner` ("You left this group. You can still see everything that happened before — it just won't
update, and you can't add anything new."), and all balance/member/feed actions are hidden via the same
`canAct = status === 'active'` gate `FeedRow` already had (no parallel check). The `closed` state's old
plain-text explanatory line was unified onto the same `Banner` component, own copy, for one consistent
"why is this read-only" visual language across both states. Balance labels switch to past tense ("you
were owed" / "you owed") for a left group. Pull-to-refresh stays enabled on a `left` group, no
special-casing.

A real pre-existing bug was found and fixed alongside this: `HomeGroupsCard.tsx`'s group list
(`activeGroups.length ? activeGroups : groups`) silently hid every non-active group whenever at least one
active group existed — already broken for `closed` groups, and would have done the same to `left`. It now
always shows every group, with an inline "· closed"/"· you left" suffix; the same suffix was added to
`ContextSwitcher.tsx`'s group-switcher menu, which previously had no status indicator at all.
`GroupMembersModal.tsx`'s "Leave this group?" confirmation copy was updated to reflect that history stays
visible read-only, rather than implying the group disappears.

Demo data (`seedGroupFixtures.ts`) gained a 5th fixture, "College Reunion," demonstrating the `left` state
— owned by a different demo user (a real leave is more realistic for a plain member than an owner), with
the demo user's own membership omitted via a new `omitSelfMembership` option that mirrors exactly what
`leaveGroup()` itself does.

### Static (accountless) members

`addStaticMember()` creates a `GroupMember` with a locally-generated pseudo `userId` (`static:<uuid>`) so
it composes with the split engine exactly like a real member, sets `accountless: true`, and emits a
`member_joined` event carrying the placeholder's identity — every **other** member's device materializes
the same local row on its next sync (`syncGroupMembers()`, called at the end of `syncGroup()`); the
server never sees the placeholder's name (Model B, ciphertext only).

### Admin-less protection (server-side)

`workers/groups/src/lib/membership.ts`'s `wouldLeaveGroupAdminless()` — called from `handleMemberChange`
for `leave`/`remove`/`set_role` — blocks any of those actions that would leave the group with active
members but zero owner/admin among them (HTTP 409, `error: 'last_admin'`), unless it's the group's sole
remaining member leaving (that empties the group entirely rather than leaving it admin-less-but-populated,
which this guard deliberately does not block — the client should offer close/delete instead).

### Delete-when-empty

`DELETE /group/:id` (`workers/groups/src/index.ts`'s `handleDeleteGroup`) is creator-only — stricter than
close/reopen's owner-or-admin `canCloseGroup` check, since deletion is irreversible for every member, not
just a freeze. The server enforces *who* may call it; the client is responsible for confirming *eligibility*
(zero non-deleted `shared_expense`/`expense_edit` events) before ever offering the action, since the server
can't re-derive that from ciphertext it never sees.

Key files:

- `packages/core/src/core/groups/groupsService.ts` — group lifecycle: `createGroup`/`joinGroup`/
  `closeGroup`/`reopenGroup`/`deleteGroup`, `shareExpenseToGroup`/`notifyExpenseDeletedToGroups`,
  `flagSharedExpense`/`clearExpenseFlag`, `voidSettlement`, `addStaticMember`
- `packages/core/src/core/groups/groupSync.ts` — `syncGroup`/`pushPending`/`pullGroupEvents`,
  `groupBalances`/`groupFeed`/`groupFlags`/`groupVoidedSettlementIds`, `syncGroupMembers`
- `packages/core/src/core/groups/split.ts` — pure split math (`computeShares`, `foldGroupBalances`)
- `packages/core/src/core/groups/keys.ts` — per-group AES key generation/wrap/unwrap, epoch rotation
- `packages/core/src/core/groups/groupsClient.ts` — signed HTTP calls to `workers/groups`
- `workers/groups/src/` — the Cloudflare Worker: `index.ts` (routes), `lib/membership.ts` (role/eligibility
  rules incl. `wouldLeaveGroupAdminless`), `groupsStore.ts` (D1 access)
- `apps/mobile/src/context/GroupContext.tsx` — active Personal|group context switcher
- `apps/mobile/src/features/groups/` — `GroupDashboard.tsx` (feed, balances, member list, all actions),
  `SharedExpenseComposer.tsx`, `SettleUpGroupModal.tsx` (repayment/write-off toggle),
  `GroupMembersModal.tsx` (invite, add static member, delete group), `CreateGroupModal.tsx`,
  `JoinGroupModal.tsx`
- `apps/mobile/src/features/iou/PromoteToGroupWizard.tsx` — personal ledger → new Group (see
  `docs/features/iou.md`)
- `apps/mobile/src/hooks/useServerActionError.ts` — shared server-error-to-toast mapping (moved here from
  `features/groups/` since `PromoteToGroupWizard.tsx`, a different feature folder, needed it too — see
  `docs/ARCHITECTURE.md`'s feature-module-isolation decision)

## Current limitations

- **No realtime push** — events sync on the same cadence as backup (Track D), not instantly; a
  co-member's change appears on next sync/pull, not the moment they make it.
- **No cross-currency splits** — a group's expenses are all in one currency (₹).
- **No combined household net-worth view** — each group's balances are independent; there's no merged
  view across groups yet (a Stage F closeout candidate).
- **An existing personal-IOU person can't be linked to an existing real group member** — the only bridge
  today is one-way, promote-to-a-**brand-new**-Group (see `docs/features/iou.md`); reconciling two
  already-independent ledgers is still open (`GroupMember.linkedPersonId` reserved, unused for this case).
- **The server can't verify group-delete eligibility** — it only enforces who may call `DELETE /group/:id`
  (creator), not whether the group is actually empty; that check is entirely client-side.
- **`buildJoinLink` falls back to a hostless invite link on `apps/mobile`** — RN has no `location.origin`;
  flagged, not yet fixed (needs a real deep-link scheme).

## Planned improvements

- **Stage F closeout** — combined household net-worth view, cross-currency splits, receipts inside group
  events, native (Capacitor/iCloud) bring-up, realtime push. See
  [`docs/plans/phase-1.5-track-E-groups.md`](../plans/phase-1.5-track-E-groups.md)'s "Not in Track E
  itself" section.
- Link an **existing** personal-IOU person to an **existing** real group member, reconciling two
  already-independent ledgers (distinct from the promote-to-new-group flow already shipped).
- A real deep-link scheme so invite links resolve to something openable on a device without the app yet.

## Ideas welcome

- Should a static/accountless member's history be reattributed automatically once their real account
  joins (`upgradedToUserId`), or should that always be an explicit user action?
- Is a push notification worth adding for a "flag as not needed" or a new shared expense, given this app
  otherwise has no notification infrastructure at all?
