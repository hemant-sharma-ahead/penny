// Group event sync (Phase 1.5 Track E, E4). Mirrors the append-only shared ledger between the device
// and the worker (which relays ciphertext only, Model B). Balances are never stored — they're folded
// from events via `split.ts`.
//
// Conflict model: the server assigns a total order (`seq`); the client keeps a `lamport` clock to break
// ties before an event is sequenced; per-event resolution is last-writer-wins on `updatedAt`; deletes
// are tombstone events (`expense_delete`) rather than row removals. Event bodies are encrypted with the
// group key at the event's epoch, so a member missing that epoch's grant simply skips the event.
import { groupEventsRepo, groupMembersRepo, groupsRepo, profileRepo, syncCursorRepo } from '@/core/db/repositories';
import type { GroupEvent, GroupEventType, GroupMember, SyncCursor } from '@/core/db/types';
import * as api from './groupsClient';
import { decryptFromGroup, encryptForGroup, loadGroupKey } from './keys';
import { foldGroupBalances, type FoldEvent, type SettlementPayload, type SharedExpensePayload } from './split';

/** The plaintext body carried inside each encrypted event blob. */
interface EventBody {
  type: GroupEventType;
  payload: unknown;
  updatedAt: number; // for last-writer-wins reconciliation
}

const scopeFor = (groupId: string): string => `group:${groupId}`;

async function getCursor(groupId: string): Promise<SyncCursor | undefined> {
  return syncCursorRepo.get(scopeFor(groupId));
}

async function setCursorSeq(groupId: string, seq: number): Promise<void> {
  const scope = scopeFor(groupId);
  const now = Date.now();
  const existing = await syncCursorRepo.get(scope);
  await syncCursorRepo.put({
    id: scope,
    scope,
    seq,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...(existing ? { version: existing.version } : {})
  });
}

async function currentUserId(): Promise<string | undefined> {
  return (await profileRepo.getAll())[0]?.userId;
}

/** All local events for a group, in effective order (server seq first, then lamport for un-synced). */
async function localEvents(groupId: string): Promise<GroupEvent[]> {
  const all = await groupEventsRepo.getAll();
  return all
    .filter((e) => e.groupId === groupId)
    .sort((a, b) => {
      const sa = a.seq ?? Number.MAX_SAFE_INTEGER;
      const sb = b.seq ?? Number.MAX_SAFE_INTEGER;
      return sa - sb || a.lamport - b.lamport;
    });
}

async function nextLamport(groupId: string): Promise<number> {
  const events = await localEvents(groupId);
  return events.reduce((max, e) => Math.max(max, e.lamport), 0) + 1;
}

/**
 * Append a new event to the local ledger and push it (with any other un-synced events). The payload is
 * encrypted with the group's current-epoch key before it leaves the device. Returns the stored event.
 */
export async function appendGroupEvent(groupId: string, type: GroupEventType, payload: unknown): Promise<GroupEvent> {
  const group = await groupsRepo.get(groupId);
  if (!group) throw new Error(`Unknown group ${groupId}`);
  if (group.status !== 'active') {
    throw new Error(group.status === 'left' ? 'You left this group' : 'Group is closed');
  }
  const now = Date.now();
  const event: GroupEvent = {
    id: crypto.randomUUID(),
    groupId,
    lamport: await nextLamport(groupId),
    authorId: (await currentUserId()) ?? 'me',
    keyEpoch: group.keyEpoch,
    type,
    payload,
    createdAt: now,
    updatedAt: now
  };
  await groupEventsRepo.put(event);
  await pushPending(groupId);
  return (await groupEventsRepo.get(event.id)) ?? event;
}

/** Encrypt + push every local event that lacks a server `seq`; record the assigned seqs. */
export async function pushPending(groupId: string): Promise<number> {
  const pending = (await localEvents(groupId)).filter((e) => e.seq === undefined);
  if (pending.length === 0) return 0;

  const outgoing = [];
  for (const e of pending) {
    const key = await loadGroupKey(groupId, e.keyEpoch);
    if (!key) continue; // no key for this epoch → can't encrypt; leave pending
    const body: EventBody = { type: e.type, payload: e.payload, updatedAt: e.updatedAt };
    outgoing.push({
      eventId: e.id,
      keyEpoch: e.keyEpoch,
      lamport: e.lamport,
      ciphertext: await encryptForGroup(key, body)
    });
  }
  if (outgoing.length === 0) return 0;

  const res = await api.appendEvents(groupId, outgoing);
  for (const a of res.assigned) {
    const e = await groupEventsRepo.get(a.event_id);
    if (e && e.seq !== a.seq) await groupEventsRepo.put({ ...e, seq: a.seq });
  }
  return res.assigned.length;
}

/** Pull events after the cursor, decrypt, and merge (LWW on updatedAt). Returns how many were fetched. */
export async function pullGroupEvents(groupId: string): Promise<number> {
  const cursor = await getCursor(groupId);
  const since = cursor?.seq ?? 0;
  const { events } = await api.fetchEvents(groupId, since);

  let maxSeq = since;
  for (const inc of events) {
    if (inc.seq > maxSeq) maxSeq = inc.seq;
    if (!inc.ciphertext) continue;
    const key = await loadGroupKey(groupId, inc.key_epoch);
    if (!key) continue; // missing grant for this epoch — skip, may resolve after syncGroupKeys
    let body: EventBody;
    try {
      body = await decryptFromGroup<EventBody>(key, inc.ciphertext);
    } catch {
      continue; // undecryptable — skip
    }
    const existing = await groupEventsRepo.get(inc.event_id);
    // Last-writer-wins: keep whichever version has the newer updatedAt.
    if (existing && existing.updatedAt > body.updatedAt) {
      if (existing.seq !== inc.seq) await groupEventsRepo.put({ ...existing, seq: inc.seq });
      continue;
    }
    await groupEventsRepo.put({
      id: inc.event_id,
      groupId,
      seq: inc.seq,
      lamport: inc.lamport,
      authorId: inc.author_id,
      keyEpoch: inc.key_epoch,
      type: body.type,
      payload: body.payload,
      createdAt: inc.created_at,
      updatedAt: body.updatedAt
    });
  }
  if (maxSeq > since) await setCursorSeq(groupId, maxSeq);
  return events.length;
}

/** Push pending, then pull, then materialize any newly-learned placeholder members — the full
 *  round-trip for one group. */
export async function syncGroup(groupId: string): Promise<void> {
  await pushPending(groupId);
  await pullGroupEvents(groupId);
  await syncGroupMembers(groupId);
}

// ─── Balances (fold events via split.ts) ────────────────────────────────────────

/** Map a stored GroupEvent to the pure fold-engine shape (only balance-affecting types). */
function toFoldEvent(e: GroupEvent): FoldEvent | null {
  switch (e.type) {
    case 'shared_expense':
      return { type: 'shared_expense', payload: e.payload as SharedExpensePayload };
    case 'expense_edit':
      return { type: 'expense_edit', payload: e.payload as SharedExpensePayload };
    case 'expense_delete': {
      const p = e.payload as { expenseId?: string };
      return p.expenseId ? { type: 'expense_delete', expenseId: p.expenseId } : null;
    }
    case 'settlement':
      return { type: 'settlement', payload: e.payload as SettlementPayload };
    case 'settlement_void': {
      const p = e.payload as { settlementId?: string };
      return p.settlementId ? { type: 'settlement_void', settlementId: p.settlementId } : null;
    }
    default:
      return null; // member_*/group_*/expense_flag* events don't affect balances
  }
}

/** Net balance per member for a group, folded from the local event mirror (positive = owed to them). */
export async function groupBalances(groupId: string): Promise<Record<string, number>> {
  const events = await localEvents(groupId);
  const fold = events.map(toFoldEvent).filter((e): e is FoldEvent => e !== null);
  return foldGroupBalances(fold);
}

/** The group's shared-expense + settlement events, newest first, for the dashboard feed. An edit
 *  supersedes its original `shared_expense` row entirely (mirrors split.ts's own fold behaviour) —
 *  kept as ONE feed row per logical `expenseId`, holding the latest edit's content, at the position of
 *  its FIRST occurrence (so editing an expense updates it in place rather than jumping it to "just
 *  now" — item 9, real-device-testing-pass.md Phase 3). */
export async function groupFeed(groupId: string): Promise<GroupEvent[]> {
  const events = await localEvents(groupId);
  const deleted = new Set(
    events.filter((e) => e.type === 'expense_delete').map((e) => (e.payload as { expenseId?: string }).expenseId)
  );
  const posByExpenseId = new Map<string, number>();
  const out: GroupEvent[] = [];
  for (const e of events) {
    if (e.type === 'shared_expense' || e.type === 'expense_edit') {
      const id = (e.payload as { expenseId?: string }).expenseId;
      if (!id) continue;
      const idx = posByExpenseId.get(id);
      if (idx === undefined) {
        posByExpenseId.set(id, out.length);
        out.push(e);
      } else {
        out[idx] = e; // superseded in place — same feed position, latest content
      }
    } else if (e.type === 'settlement') {
      out.push(e);
    }
  }
  return out
    .filter((e) => {
      const id = (e.payload as { expenseId?: string }).expenseId;
      return !(id && deleted.has(id));
    })
    .reverse();
}

/** Every `settlement.id` that a later `settlement_void` event has reversed — the fold engine already
 *  excludes these from balances (split.ts); the UI additionally uses this set to hide an already-voided
 *  settlement's own "Undo write-off" action and to show an "undone" state instead. */
export async function groupVoidedSettlementIds(groupId: string): Promise<Set<string>> {
  const events = await localEvents(groupId);
  const voided = new Set<string>();
  for (const e of events) {
    if (e.type !== 'settlement_void') continue;
    const id = (e.payload as { settlementId?: string }).settlementId;
    if (id) voided.add(id);
  }
  return voided;
}

// ─── Flags ("not needed") — item 9 ──────────────────────────────────────────────

/** A pending "flag as not needed" on a shared expense, still awaiting the recorder's Keep/Delete. */
export interface PendingFlag {
  expenseId: string;
  /** Who raised the flag (a `GroupEvent.authorId`). */
  byAuthorId: string;
  note?: string;
  createdAt: number;
}

/**
 * Currently-pending flags for a group — a flag is pending unless a later `expense_flag_clear` (the
 * recorder's "Keep") or `expense_delete` (the recorder's "Delete") on the same `expenseId` resolved it.
 * A fresh `expense_flag` re-opens the conversation even if an earlier one on the same expense was
 * already cleared. Durable, sync-carried state — no push-notification infra exists in this app (see
 * this feature's mockup, docs/mockups/proposals/groups-redesign-v1.html §1) — surfaced inline on the
 * feed row plus a dashboard-top `Banner` aggregate.
 */
export async function groupFlags(groupId: string): Promise<PendingFlag[]> {
  const events = await localEvents(groupId);
  const deleted = new Set<string>();
  const cleared = new Set<string>();
  const flags = new Map<string, PendingFlag>();

  for (const e of events) {
    if (e.type === 'expense_delete') {
      const id = (e.payload as { expenseId?: string }).expenseId;
      if (id) deleted.add(id);
    } else if (e.type === 'expense_flag_clear') {
      const id = (e.payload as { expenseId?: string }).expenseId;
      if (id) cleared.add(id);
    } else if (e.type === 'expense_flag') {
      const p = e.payload as { expenseId?: string; note?: string };
      if (!p.expenseId) continue;
      cleared.delete(p.expenseId); // a fresh flag re-opens even a previously-cleared one
      flags.set(p.expenseId, {
        expenseId: p.expenseId,
        byAuthorId: e.authorId,
        ...(p.note ? { note: p.note } : {}),
        createdAt: e.createdAt
      });
    }
  }

  return [...flags.values()].filter((f) => !cleared.has(f.expenseId) && !deleted.has(f.expenseId));
}

// ─── Placeholder-member materialization — item 17 ───────────────────────────────

/** The plaintext body a `member_joined` event carries for a placeholder/static member (item 17) —
 *  real invited members already get a local `GroupMember` row directly from `groupsService.ts`'s
 *  `createGroup`/`redeemInvite`, so this event only exists to carry a placeholder's identity to every
 *  OTHER member's device (the worker never sees a placeholder's name — Model B, ciphertext only). */
interface MemberJoinedPayload {
  userId: string;
  displayName: string;
  accountless?: boolean;
  linkedPersonId?: string;
}

/**
 * Materialize any `member_joined` events for members this device doesn't already know about — today
 * that's exactly the placeholder/static-member case (item 17): the adding device already wrote its own
 * `groupMembersRepo` row before emitting the event, so this only ever needs to CREATE a row for an id
 * it has never seen, never overwrite an existing one (a real member's own row is authoritative from
 * `createGroup`/`redeemInvite` and must never be clobbered by a stale/duplicate `member_joined`).
 * Safe to call unconditionally — old seed-fixture `member_joined` events with an empty payload are
 * silently ignored (no `userId`/`displayName` to materialize).
 */
export async function syncGroupMembers(groupId: string): Promise<void> {
  const events = await localEvents(groupId);
  const known = new Set((await groupMembersRepo.getAll()).filter((m) => m.groupId === groupId).map((m) => m.id));
  for (const e of events) {
    if (e.type !== 'member_joined') continue;
    const p = e.payload as Partial<MemberJoinedPayload>;
    if (!p.userId || !p.displayName) continue;
    const id = `${groupId}:${p.userId}`;
    if (known.has(id)) continue;
    const now = Date.now();
    const member: GroupMember = {
      id,
      groupId,
      userId: p.userId,
      displayName: p.displayName,
      role: 'member',
      status: 'active',
      ...(p.accountless ? { accountless: true } : {}),
      ...(p.linkedPersonId ? { linkedPersonId: p.linkedPersonId } : {}),
      joinedAt: e.createdAt,
      createdAt: now,
      updatedAt: now
    };
    await groupMembersRepo.put(member);
    known.add(id);
  }
}
