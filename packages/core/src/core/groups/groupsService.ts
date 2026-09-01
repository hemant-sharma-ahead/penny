// Group lifecycle orchestration (Phase 1.5 Track E, E2). Ties together the worker (groupsClient), the
// group crypto (keys.ts), and the local encrypted mirror (groups/group_members repos). Model B: the
// name + event bodies are Group-Key-encrypted before they leave the device; the server relays ciphertext.
//
// Membership lifecycle: create → invite (link/QR) → redeem → an admin grants the Group Key → the joiner
// unwraps it and can finally read the name/feed. Leaving rotates the key so the departed member can't
// read new activity.
import { profileRepo, groupsRepo, groupMembersRepo, groupEventsRepo } from '@/core/db/repositories';
import { NotClaimedError } from '@/core/identity/signedFetch';
import type { Group, GroupHistoryVisibility, GroupMember, GroupRole, GroupType } from '@/core/db/types';
import * as api from './groupsClient';
import { appendGroupEvent } from './groupSync';
import { equalSplit } from './split';
import {
  decryptFromGroup,
  encryptForGroup,
  generateGroupKey,
  loadGroupKey,
  persistGroupKey,
  redeemGroupKeyGrant,
  wrapStoredGroupKeyFor
} from './keys';

async function currentUserId(): Promise<string> {
  const profile = (await profileRepo.getAll())[0];
  if (!profile?.userId) throw new NotClaimedError('No claimed account on this device');
  return profile.userId;
}

async function selfDisplayName(): Promise<string> {
  const profile = (await profileRepo.getAll())[0];
  return profile?.username || 'You';
}

/** Epochs a member on a given visibility should hold keys for, given the current epoch. */
function grantableEpochs(currentEpoch: number, visibility: GroupHistoryVisibility): number[] {
  if (visibility === 'from_join') return [currentEpoch];
  return Array.from({ length: currentEpoch }, (_, i) => i + 1);
}

// ─── Create ─────────────────────────────────────────────────────────────────────

export async function createGroup(input: {
  name: string;
  type: GroupType;
  historyVisibility: GroupHistoryVisibility;
}): Promise<Group> {
  const userId = await currentUserId();
  // Generate the Group Key first so we can encrypt the name before the server ever sees it.
  const key = await generateGroupKey();
  const encName = await encryptForGroup(key, input.name);
  const res = await api.createGroup({ type: input.type, encName, historyVisibility: input.historyVisibility });
  await persistGroupKey(res.group_id, res.key_epoch, key);

  const now = Date.now();
  const group: Group = {
    id: res.group_id,
    type: input.type,
    name: input.name,
    role: 'owner',
    status: 'active',
    ownerId: userId,
    keyEpoch: res.key_epoch,
    historyVisibility: input.historyVisibility,
    joinedAt: now,
    createdAt: now,
    updatedAt: now
  };
  await groupsRepo.put(group);
  await groupMembersRepo.put(memberRecord(res.group_id, userId, await selfDisplayName(), 'owner', now));
  return group;
}

function memberRecord(groupId: string, userId: string, displayName: string, role: GroupRole, now: number): GroupMember {
  return {
    id: `${groupId}:${userId}`,
    groupId,
    userId,
    displayName,
    role,
    status: 'active',
    joinedAt: now,
    createdAt: now,
    updatedAt: now
  };
}

// ─── Invite / redeem ──────────────────────────────────────────────────────────

/** Create an invite; returns the raw secret (only the SHA-256 is stored server-side). */
export async function createInvite(
  groupId: string,
  opts: { role?: GroupRole; ttlMs?: number; maxUses?: number } = {}
): Promise<{ secret: string; expiresAt: number }> {
  const secret = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const tokenHash = await api.hashInviteSecret(secret);
  const expiresAt = Date.now() + (opts.ttlMs ?? 7 * 24 * 60 * 60 * 1000);
  await api.createInvite(groupId, {
    tokenHash,
    role: opts.role ?? 'member',
    expiresAt,
    maxUses: opts.maxUses ?? 1
  });
  return { secret, expiresAt };
}

/** Build the shareable join link/QR payload for an invite secret. */
export function buildJoinLink(secret: string, origin = typeof location !== 'undefined' ? location.origin : ''): string {
  return `${origin}/app/groups/join#${secret}`;
}

/** Parse the secret out of a join link (accepts the raw secret too). */
export function parseJoinSecret(linkOrSecret: string): string {
  const hash = linkOrSecret.includes('#') ? linkOrSecret.slice(linkOrSecret.indexOf('#') + 1) : linkOrSecret;
  return hash.trim();
}

/**
 * Redeem an invite: join the group and mirror it locally. The Group Key arrives later as a grant, so
 * the name may be undecryptable at first — `awaitingKey` is true until {@link syncGroupKeys} runs.
 */
export async function redeemInvite(secret: string): Promise<{ groupId: string; awaitingKey: boolean }> {
  const userId = await currentUserId();
  const tokenHash = await api.hashInviteSecret(secret);
  const meta = await api.redeemInvite(tokenHash);

  const key = await loadGroupKey(meta.group_id, meta.key_epoch);
  let name = '';
  if (key) {
    try {
      name = await decryptFromGroup<string>(key, meta.enc_name);
    } catch {
      /* stale/foreign key — leave blank until re-synced */
    }
  }

  const now = Date.now();
  await groupsRepo.put({
    id: meta.group_id,
    type: meta.type,
    name,
    role: meta.role ?? 'member',
    status: 'active',
    ownerId: meta.owner_id,
    keyEpoch: meta.key_epoch,
    historyVisibility: meta.history_visibility,
    joinedAt: now,
    createdAt: now,
    updatedAt: now
  });
  await groupMembersRepo.put(memberRecord(meta.group_id, userId, await selfDisplayName(), meta.role ?? 'member', now));
  return { groupId: meta.group_id, awaitingKey: !key };
}

// ─── Key grants ─────────────────────────────────────────────────────────────────

/**
 * Pull any Group-Key grants addressed to this device, unwrap + persist them, then decrypt the group
 * name if it was awaiting the key. Returns true if any key was newly obtained.
 */
export async function syncGroupKeys(groupId: string): Promise<boolean> {
  const grants = await api.fetchMyGrants(groupId);
  if (grants.length === 0) return false;
  for (const g of grants) await redeemGroupKeyGrant(groupId, g.keyEpoch, g.grant);

  const group = await groupsRepo.get(groupId);
  if (group && !group.name) {
    const meta = await api.getGroup(groupId);
    const key = await loadGroupKey(groupId, meta.key_epoch);
    if (key) {
      try {
        const name = await decryptFromGroup<string>(key, meta.enc_name);
        await groupsRepo.put({ ...group, name, keyEpoch: meta.key_epoch, updatedAt: Date.now() });
      } catch {
        /* still can't decrypt — leave as-is */
      }
    }
  }
  return true;
}

/**
 * Admin/owner action: wrap the Group Key to every active member (per the group's history-visibility)
 * and relay the grants. Idempotent — the server upserts, so re-running is safe (e.g. after a new join).
 */
export async function grantKeysToMembers(groupId: string): Promise<number> {
  const group = await groupsRepo.get(groupId);
  if (!group) throw new Error(`Unknown group ${groupId}`);
  const epochs = grantableEpochs(group.keyEpoch, group.historyVisibility);
  const { members } = await api.listMembers(groupId);

  let granted = 0;
  for (const m of members) {
    if (m.status !== 'active' || !m.wrapping_key) continue;
    const peerJwk = JSON.parse(m.wrapping_key) as JsonWebKey;
    const grants = [];
    for (const epoch of epochs) {
      if (await loadGroupKey(groupId, epoch)) {
        grants.push({ keyEpoch: epoch, grant: await wrapStoredGroupKeyFor(groupId, epoch, peerJwk) });
      }
    }
    if (grants.length > 0) {
      await api.sendGrants(groupId, m.user_id, grants);
      granted++;
    }
  }
  return granted;
}

// ─── Membership ───────────────────────────────────────────────────────────────

export async function setMemberRole(groupId: string, userId: string, role: GroupRole): Promise<void> {
  await api.setMemberRole(groupId, userId, role);
  const rec = await groupMembersRepo.get(`${groupId}:${userId}`);
  if (rec) await groupMembersRepo.put({ ...rec, role, updatedAt: Date.now() });
}

/** Leave a group: tell the server, drop the caller's own local membership row, and mark the group
 *  `left` so it stays on-device as read-only history — the `groups` record and its `group_events`
 *  are kept intact (not deleted) so GroupDashboard can keep rendering everything that happened
 *  before the leave, frozen. The caller should trigger rotation from an admin device (a leaver
 *  can't rotate for others). */
export async function leaveGroup(groupId: string): Promise<void> {
  const userId = await currentUserId();
  await api.leaveGroup(groupId);
  await groupMembersRepo.delete(`${groupId}:${userId}`);
  const group = await groupsRepo.get(groupId);
  if (group) await groupsRepo.put({ ...group, status: 'left', updatedAt: Date.now() });
}

/**
 * Remove a member (admin/owner), then rotate the Group Key so the removed member can't read new
 * activity: generate a new epoch key, re-encrypt the name under it, tell the server, and re-grant to
 * the remaining members. Returns the new epoch.
 */
export async function removeMemberAndRotate(groupId: string, userId: string): Promise<number> {
  await api.removeMember(groupId, userId);
  await groupMembersRepo.delete(`${groupId}:${userId}`);
  return rotateGroupKey(groupId);
}

/** Generate a fresh epoch key, re-encrypt the name, publish the rotation, and re-grant to members. */
export async function rotateGroupKey(groupId: string): Promise<number> {
  const group = await groupsRepo.get(groupId);
  if (!group) throw new Error(`Unknown group ${groupId}`);
  const newEpoch = group.keyEpoch + 1;
  const key = await generateGroupKey();
  await persistGroupKey(groupId, newEpoch, key);
  const encName = await encryptForGroup(key, group.name);
  const res = await api.rotateGroup(groupId, encName);
  await groupsRepo.put({ ...group, keyEpoch: res.key_epoch, updatedAt: Date.now() });
  await grantKeysToMembers(groupId);
  return res.key_epoch;
}

/** Settle & close (owner/admin): freeze the group's ledger. Reflected locally so the UI locks Add/Settle. */
export async function closeGroup(groupId: string): Promise<void> {
  const res = await api.closeGroup(groupId);
  const group = await groupsRepo.get(groupId);
  if (group)
    await groupsRepo.put({ ...group, status: res.status === 'closed' ? 'closed' : 'active', updatedAt: Date.now() });
}

/** Reopen a closed group. */
export async function reopenGroup(groupId: string): Promise<void> {
  const res = await api.reopenGroup(groupId);
  const group = await groupsRepo.get(groupId);
  if (group)
    await groupsRepo.put({ ...group, status: res.status === 'closed' ? 'closed' : 'active', updatedAt: Date.now() });
}

// ─── Personal → group share (Track E, E5) ──────────────────────────────────────

/**
 * Share a personal expense into a group as an equal-split `shared_expense` (the lightweight
 * "Share with a group" path from the personal Expense form, and the trip↔group flow). The payer is
 * you; participants default to all active members. Returns the mirrored event's `expenseId`.
 *
 * `input.expenseId` should be the personal `Expense.id` whenever this call is backing a real personal
 * transaction (every current caller passes it) — using the SAME id as the fold engine's logical
 * `expenseId` is what lets {@link notifyExpenseDeletedToGroups} later tombstone this exact event when
 * the personal expense is deleted, without needing a separate id-mapping table. Falls back to a fresh
 * random id only when the caller has no personal expense to key off of (kept for that case + so
 * existing tests that don't pass one keep working).
 */
export async function shareExpenseToGroup(
  groupId: string,
  input: { expenseId?: string; amount: number; description: string; categoryId?: string; participants?: string[] }
): Promise<string> {
  const userId = await currentUserId();
  const active = (await groupMembersRepo.getAll()).filter((m) => m.groupId === groupId && m.status === 'active');
  const participants = input.participants?.length ? input.participants : active.map((m) => m.userId);
  const expenseId = input.expenseId ?? crypto.randomUUID();
  await appendGroupEvent(groupId, 'shared_expense', {
    expenseId,
    amount: input.amount,
    payer: userId,
    shares: equalSplit(input.amount, participants),
    description: input.description,
    ...(input.categoryId ? { categoryId: input.categoryId } : {})
  });
  return expenseId;
}

/**
 * Tombstone a shared expense out of every group it was shared to, when the personal `Expense` that
 * backed it is deleted (item 9, "orphaned shared transactions" — until this fix, `group_events` kept a
 * stale `shared_expense` referencing a transaction that no longer existed forever). `expenseId` must be
 * the same value `shareExpenseToGroup` was called with (the personal `Expense.id`) — `foldGroupBalances`/
 * `groupFeed` (split.ts) already match `expense_delete.expenseId` against `shared_expense.payload.expenseId`
 * and filter/exclude it, so this is pure wiring, no new fold logic.
 *
 * Best-effort per group: a group that's closed, was already left, or is temporarily unreachable must
 * never block the personal delete (see CLAUDE.md's reliability rule) — the local tombstone event is
 * still durably queued by `appendGroupEvent` before any network push, so it resyncs the next time this
 * device opens that group (`GroupDashboard.tsx`'s `syncGroup` call) even if the push here fails/throws.
 * Safe to call unconditionally for every group id in `Expense.shareWith`, even one that never actually
 * holds a matching `shared_expense` (e.g. a bridged reflection txn) — an unmatched `expenseId` is simply
 * ignored by the fold engine.
 */
export async function notifyExpenseDeletedToGroups(expenseId: string, groupIds: string[]): Promise<void> {
  for (const groupId of groupIds) {
    try {
      await appendGroupEvent(groupId, 'expense_delete', { expenseId });
    } catch {
      // Group closed/unknown locally, or the network push failed — the event is already persisted
      // locally (appendGroupEvent writes it before pushing), so it isn't lost, just delayed.
    }
  }
}

// ─── Flags — "flag as not needed" (item 9) ─────────────────────────────────────

/** Raise a lightweight "not needed" flag on someone else's `shared_expense` — durable, sync-carried
 *  state (no push-notification infra exists in this app); the recorder sees it next time they open/
 *  sync the group. Does not touch the ledger itself. */
export async function flagSharedExpense(groupId: string, expenseId: string, note?: string): Promise<void> {
  await appendGroupEvent(groupId, 'expense_flag', { expenseId, ...(note ? { note } : {}) });
}

/** The recorder "Keep"s a flagged expense — dismisses the flag without touching the ledger. (Choosing
 *  "Delete" instead just emits the existing `expense_delete`, which already resolves any pending flag
 *  on that id too — see `groupFlags` in groupSync.ts.) */
export async function clearExpenseFlag(groupId: string, expenseId: string): Promise<void> {
  await appendGroupEvent(groupId, 'expense_flag_clear', { expenseId });
}

// ─── Write-off marking (item 17) ───────────────────────────────────────────────

/** Reverse a settlement (real repayment or write-off) — the fold engine excludes a voided settlement
 *  entirely (split.ts), restoring the balance to exactly what it was before. Primarily meant for
 *  undoing a write-off ("never coming back" → "actually, still outstanding"), but works for any
 *  settlement that carries an `id` (older, pre-this-feature settlements without one can't be voided). */
export async function voidSettlement(groupId: string, settlementId: string): Promise<void> {
  await appendGroupEvent(groupId, 'settlement_void', { settlementId });
}

// ─── Static (non-app) members (item 17) ────────────────────────────────────────

/**
 * Add a name-only "placeholder" member — no real account, can't sync/confirm anything itself; a real
 * member manages their splits/settlements on their behalf. Uses a locally-generated pseudo `userId`
 * (`static:<uuid>`) as the fold-engine key, so it composes with `computeShares`/`foldGroupBalances`
 * exactly like a real member. Emits a `member_joined` event carrying the placeholder's identity so
 * every OTHER member's device materializes the same local `GroupMember` row on their next sync (see
 * `syncGroupMembers` in groupSync.ts) — the worker never sees the name (Model B, ciphertext only).
 *
 * `linkedPersonId` is set when this call is backing a personal-ledger→Group promotion (item 17's other
 * half) — the promoted person starts out as a placeholder in the new group (no account yet) until they
 * redeem the invite generated alongside it.
 */
export async function addStaticMember(
  groupId: string,
  displayName: string,
  opts: { linkedPersonId?: string } = {}
): Promise<GroupMember> {
  const userId = `static:${crypto.randomUUID()}`;
  const now = Date.now();
  const member: GroupMember = {
    id: `${groupId}:${userId}`,
    groupId,
    userId,
    displayName,
    role: 'member',
    status: 'active',
    accountless: true,
    ...(opts.linkedPersonId ? { linkedPersonId: opts.linkedPersonId } : {}),
    joinedAt: now,
    createdAt: now,
    updatedAt: now
  };
  await groupMembersRepo.put(member);
  await appendGroupEvent(groupId, 'member_joined', {
    userId,
    displayName,
    accountless: true,
    ...(opts.linkedPersonId ? { linkedPersonId: opts.linkedPersonId } : {})
  });
  return member;
}

// ─── Delete-when-empty for creator (item 9) ────────────────────────────────────

/**
 * Creator-only, irreversible: deletes the group on the server for every member, then drops the local
 * mirror (members + events + the group itself). Callers must confirm eligibility themselves (zero
 * non-deleted `shared_expense`/`expense_edit` events — see `groupFeed` in groupSync.ts) before calling;
 * the worker enforces creator-only but can't re-derive "is it empty" from ciphertext it can't read.
 */
export async function deleteGroup(groupId: string): Promise<void> {
  await api.deleteGroup(groupId);
  const [members, events] = await Promise.all([groupMembersRepo.getAll(), groupEventsRepo.getAll()]);
  await Promise.all([
    ...members.filter((m) => m.groupId === groupId).map((m) => groupMembersRepo.delete(m.id)),
    ...events.filter((e) => e.groupId === groupId).map((e) => groupEventsRepo.delete(e.id))
  ]);
  await groupsRepo.delete(groupId);
}

// ─── Local reads ────────────────────────────────────────────────────────────────

export async function listLocalGroups(): Promise<Group[]> {
  return (await groupsRepo.getAll()).sort((a, b) => b.updatedAt - a.updatedAt);
}
