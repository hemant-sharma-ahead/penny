// Groups worker client (Phase 1.5 Track E, E1).
// Thin `signedFetch`-based wrappers over the penny-groups worker — the single client choke point for
// group calls (create/invite/join, key-grant relay, event append/fetch). All requests are signed with
// the device key and authorized server-side by membership. Ciphertext-only (Model B): names + event
// bodies are encrypted with the Group Key (see keys.ts) before they ever leave the device.
import { GROUPS_BASE } from '@/core/net/apiBase';
import { signedFetch, SyncNotConfiguredError } from '@/core/identity/signedFetch';
import type { GroupHistoryVisibility, GroupRole, GroupType } from '@/core/db/types';
import type { GroupKeyGrant } from './keys';

function groupsFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!GROUPS_BASE) throw new SyncNotConfiguredError();
  return signedFetch(path, init, GROUPS_BASE);
}

async function ok<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new GroupsApiError(res.status, body.error ?? 'request_failed', body.message);
  }
  return (await res.json()) as T;
}

/** A non-2xx response from the groups worker, carrying the worker's error code. */
export class GroupsApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = 'GroupsApiError';
  }
}

function jsonBody(data: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(data) };
}

// ─── Group lifecycle ──────────────────────────────────────────────────────────

export interface GroupMeta {
  group_id: string;
  type: GroupType;
  enc_name: string;
  owner_id: string;
  key_epoch: number;
  history_visibility: GroupHistoryVisibility;
  status?: string;
  role?: GroupRole;
}

/** Create a group. `encName` is the AES-GCM(GroupKey, name) blob (server never sees the name). */
export function createGroup(input: {
  type: GroupType;
  encName: string;
  historyVisibility: GroupHistoryVisibility;
}): Promise<{ ok: true; group_id: string; key_epoch: number }> {
  return groupsFetch(
    '/group',
    jsonBody({
      type: input.type,
      enc_name: input.encName,
      history_visibility: input.historyVisibility
    })
  ).then(ok);
}

export function getGroup(groupId: string): Promise<GroupMeta> {
  return groupsFetch(`/group/${groupId}`).then(ok);
}

export function closeGroup(groupId: string): Promise<{ ok: true; status: string }> {
  return groupsFetch(`/group/${groupId}/close`, jsonBody({})).then(ok);
}

export function reopenGroup(groupId: string): Promise<{ ok: true; status: string }> {
  return groupsFetch(`/group/${groupId}/reopen`, jsonBody({})).then(ok);
}

// ─── Invites ──────────────────────────────────────────────────────────────────

/** Hex SHA-256 of the raw invite secret — only this hash is sent to the server (secret stays in the link). */
export async function hashInviteSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function createInvite(
  groupId: string,
  input: { tokenHash: string; role: GroupRole; expiresAt: number; maxUses: number }
): Promise<{ ok: true }> {
  return groupsFetch(
    `/group/${groupId}/invite`,
    jsonBody({
      token_hash: input.tokenHash,
      role: input.role,
      expires_at: input.expiresAt,
      max_uses: input.maxUses
    })
  ).then(ok);
}

export function redeemInvite(tokenHash: string): Promise<GroupMeta & { ok: true }> {
  return groupsFetch('/invite/redeem', jsonBody({ token_hash: tokenHash })).then(ok);
}

export function revokeInvite(groupId: string, tokenHash: string): Promise<{ ok: true }> {
  return groupsFetch('/invite/revoke', jsonBody({ group_id: groupId, token_hash: tokenHash })).then(ok);
}

// ─── Members ────────────────────────────────────────────────────────────────────

export interface ServerMember {
  user_id: string;
  role: GroupRole;
  status: string;
  joined_at: number;
  left_at: number | null;
  wrapping_key: string | null; // that member's ECDH wrapping public JWK (JSON string), for grants
}

export function listMembers(groupId: string): Promise<{ members: ServerMember[] }> {
  return groupsFetch(`/group/${groupId}/members`).then(ok);
}

export function leaveGroup(groupId: string): Promise<{ ok: true }> {
  return groupsFetch(`/group/${groupId}/member`, jsonBody({ action: 'leave' })).then(ok);
}

export function removeMember(groupId: string, userId: string): Promise<{ ok: true }> {
  return groupsFetch(`/group/${groupId}/member`, jsonBody({ action: 'remove', user_id: userId })).then(ok);
}

export function setMemberRole(groupId: string, userId: string, role: GroupRole): Promise<{ ok: true }> {
  return groupsFetch(`/group/${groupId}/member`, jsonBody({ action: 'set_role', user_id: userId, role })).then(ok);
}

// ─── Key grants ───────────────────────────────────────────────────────────────

/** Relay wrapped Group-Key grant(s) to a member (one per epoch per the group's history-visibility). */
export function sendGrants(
  groupId: string,
  userId: string,
  grants: { keyEpoch: number; grant: GroupKeyGrant }[]
): Promise<{ ok: true }> {
  return groupsFetch(
    `/group/${groupId}/grant`,
    jsonBody({
      user_id: userId,
      grants: grants.map((g) => ({ key_epoch: g.keyEpoch, wrapped_key: JSON.stringify(g.grant) }))
    })
  ).then(ok);
}

/** Fetch my wrapped grants; each `grant` parses back into a {@link GroupKeyGrant} for unwrapping. */
export async function fetchMyGrants(groupId: string): Promise<{ keyEpoch: number; grant: GroupKeyGrant }[]> {
  const res = await groupsFetch(`/group/${groupId}/grants`).then((r) =>
    ok<{ grants: { key_epoch: number; wrapped_key: string }[] }>(r)
  );
  return res.grants.map((g) => ({ keyEpoch: g.key_epoch, grant: JSON.parse(g.wrapped_key) as GroupKeyGrant }));
}

// ─── Events ─────────────────────────────────────────────────────────────────────

export interface OutgoingEvent {
  eventId: string;
  keyEpoch: number;
  lamport: number;
  ciphertext: string; // base64(iv||ciphertext) from encryptForGroup
}

export interface IncomingEvent {
  seq: number;
  event_id: string;
  author_id: string;
  key_epoch: number;
  lamport: number;
  created_at: number;
  ciphertext: string | null;
}

export function appendEvents(
  groupId: string,
  events: OutgoingEvent[]
): Promise<{ ok: true; assigned: { event_id: string; seq: number }[] }> {
  return groupsFetch(
    `/group/${groupId}/events`,
    jsonBody({
      events: events.map((e) => ({
        event_id: e.eventId,
        key_epoch: e.keyEpoch,
        lamport: e.lamport,
        ciphertext: e.ciphertext
      }))
    })
  ).then(ok);
}

export function fetchEvents(groupId: string, sinceSeq = 0): Promise<{ events: IncomingEvent[] }> {
  return groupsFetch(`/group/${groupId}/events?since=${sinceSeq}`).then(ok);
}
