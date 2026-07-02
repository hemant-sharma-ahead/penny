// Group lifecycle orchestration (Phase 1.5 Track E, E2). Ties together the worker (groupsClient), the
// group crypto (keys.ts), and the local encrypted mirror (groups/group_members repos). Model B: the
// name + event bodies are Group-Key-encrypted before they leave the device; the server relays ciphertext.
//
// Membership lifecycle: create → invite (link/QR) → redeem → an admin grants the Group Key → the joiner
// unwraps it and can finally read the name/feed. Leaving rotates the key so the departed member can't
// read new activity.
import { profileRepo, groupsRepo, groupMembersRepo } from '@/core/db/repositories';
import { NotClaimedError } from '@/core/identity/signedFetch';
import type { Group, GroupHistoryVisibility, GroupMember, GroupRole, GroupType } from '@/core/db/types';
import * as api from './groupsClient';
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

/** Leave a group: tell the server, drop the local mirror. The caller should trigger rotation from an
 *  admin device (a leaver can't rotate for others). */
export async function leaveGroup(groupId: string): Promise<void> {
  const userId = await currentUserId();
  await api.leaveGroup(groupId);
  await groupMembersRepo.delete(`${groupId}:${userId}`);
  const group = await groupsRepo.get(groupId);
  if (group) await groupsRepo.delete(groupId);
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

// ─── Local reads ────────────────────────────────────────────────────────────────

export async function listLocalGroups(): Promise<Group[]> {
  return (await groupsRepo.getAll()).sort((a, b) => b.updatedAt - a.updatedAt);
}
