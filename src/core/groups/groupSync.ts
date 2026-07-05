// Group event sync (Phase 1.5 Track E, E4). Mirrors the append-only shared ledger between the device
// and the worker (which relays ciphertext only, Model B). Balances are never stored — they're folded
// from events via `split.ts`.
//
// Conflict model: the server assigns a total order (`seq`); the client keeps a `lamport` clock to break
// ties before an event is sequenced; per-event resolution is last-writer-wins on `updatedAt`; deletes
// are tombstone events (`expense_delete`) rather than row removals. Event bodies are encrypted with the
// group key at the event's epoch, so a member missing that epoch's grant simply skips the event.
import { groupEventsRepo, groupsRepo, profileRepo, syncCursorRepo } from '@/core/db/repositories';
import type { GroupEvent, GroupEventType, SyncCursor } from '@/core/db/types';
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
  if (group.status !== 'active') throw new Error('Group is closed');
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

/** Push pending, then pull — the full round-trip for one group. */
export async function syncGroup(groupId: string): Promise<void> {
  await pushPending(groupId);
  await pullGroupEvents(groupId);
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
    default:
      return null; // member_*/group_* events don't affect balances
  }
}

/** Net balance per member for a group, folded from the local event mirror (positive = owed to them). */
export async function groupBalances(groupId: string): Promise<Record<string, number>> {
  const events = await localEvents(groupId);
  const fold = events.map(toFoldEvent).filter((e): e is FoldEvent => e !== null);
  return foldGroupBalances(fold);
}

/** The group's shared-expense + settlement events, newest first, for the dashboard feed. */
export async function groupFeed(groupId: string): Promise<GroupEvent[]> {
  const events = await localEvents(groupId);
  const deleted = new Set(
    events.filter((e) => e.type === 'expense_delete').map((e) => (e.payload as { expenseId?: string }).expenseId)
  );
  return events
    .filter((e) => e.type === 'shared_expense' || e.type === 'expense_edit' || e.type === 'settlement')
    .filter((e) => {
      const id = (e.payload as { expenseId?: string }).expenseId;
      return !(id && deleted.has(id));
    })
    .reverse();
}
