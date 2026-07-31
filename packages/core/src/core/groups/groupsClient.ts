// Groups worker client (Phase 1.5 Track E, E1).
// Thin `signedFetch`-based wrappers over the penny-groups worker — the single client choke point for
// group calls (create/invite/join, key-grant relay, event append/fetch). All requests are signed with
// the device key and authorized server-side by membership. Ciphertext-only (Model B): names + event
// bodies are encrypted with the Group Key (see keys.ts) before they ever leave the device.
import { GROUPS_BASE } from '@/core/net/apiBase';
import { signedFetch, SyncNotConfiguredError } from '@/core/identity/signedFetch';
import type { GroupHistoryVisibility, GroupRole, GroupType } from '@/core/db/types';
import type { GroupKeyGrant } from './keys';

/** A non-2xx response from the groups worker, carrying the worker's error code. */
export class GroupsApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'GroupsApiError';
    this.status = status;
    this.code = code;
  }
}

/** Signed request to the groups worker, parsed as `T`. Throws {@link GroupsApiError} on non-2xx. */
async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!GROUPS_BASE) throw new SyncNotConfiguredError();
  const res = await signedFetch(path, init, GROUPS_BASE);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new GroupsApiError(res.status, body.error ?? 'request_failed', body.message);
  }
  return (await res.json()) as T;
}

function post(data: unknown): RequestInit {
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
  return req(
    '/group',
    post({ type: input.type, enc_name: input.encName, history_visibility: input.historyVisibility })
  );
}

export function getGroup(groupId: string): Promise<GroupMeta> {
  return req(`/group/${groupId}`);
}

export function closeGroup(groupId: string): Promise<{ ok: true; status: string }> {
  return req(`/group/${groupId}/close`, post({}));
}

export function reopenGroup(groupId: string): Promise<{ ok: true; status: string }> {
  return req(`/group/${groupId}/reopen`, post({}));
}

/** Rotate the Group-Key epoch (after a member leaves). `encName` re-encrypts the name under the new key. */
export function rotateGroup(groupId: string, encName: string): Promise<{ ok: true; key_epoch: number }> {
  return req(`/group/${groupId}/rotate`, post({ enc_name: encName }));
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
  return req(
    `/group/${groupId}/invite`,
    post({ token_hash: input.tokenHash, role: input.role, expires_at: input.expiresAt, max_uses: input.maxUses })
  );
}

export function redeemInvite(tokenHash: string): Promise<GroupMeta & { ok: true }> {
  return req('/invite/redeem', post({ token_hash: tokenHash }));
}

export function revokeInvite(groupId: string, tokenHash: string): Promise<{ ok: true }> {
  return req('/invite/revoke', post({ group_id: groupId, token_hash: tokenHash }));
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
  return req(`/group/${groupId}/members`);
}

export function leaveGroup(groupId: string): Promise<{ ok: true }> {
  return req(`/group/${groupId}/member`, post({ action: 'leave' }));
}

export function removeMember(groupId: string, userId: string): Promise<{ ok: true }> {
  return req(`/group/${groupId}/member`, post({ action: 'remove', user_id: userId }));
}

export function setMemberRole(groupId: string, userId: string, role: GroupRole): Promise<{ ok: true }> {
  return req(`/group/${groupId}/member`, post({ action: 'set_role', user_id: userId, role }));
}

// ─── Key grants ───────────────────────────────────────────────────────────────

/** Relay wrapped Group-Key grant(s) to a member (one per epoch per the group's history-visibility). */
export function sendGrants(
  groupId: string,
  userId: string,
  grants: { keyEpoch: number; grant: GroupKeyGrant }[]
): Promise<{ ok: true }> {
  return req(
    `/group/${groupId}/grant`,
    post({
      user_id: userId,
      grants: grants.map((g) => ({ key_epoch: g.keyEpoch, wrapped_key: JSON.stringify(g.grant) }))
    })
  );
}

/** Fetch my wrapped grants; each `grant` parses back into a {@link GroupKeyGrant} for unwrapping. */
export async function fetchMyGrants(groupId: string): Promise<{ keyEpoch: number; grant: GroupKeyGrant }[]> {
  const res = await req<{ grants: { key_epoch: number; wrapped_key: string }[] }>(`/group/${groupId}/grants`);
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
  return req(
    `/group/${groupId}/events`,
    post({
      events: events.map((e) => ({
        event_id: e.eventId,
        key_epoch: e.keyEpoch,
        lamport: e.lamport,
        ciphertext: e.ciphertext
      }))
    })
  );
}

export function fetchEvents(groupId: string, sinceSeq = 0): Promise<{ events: IncomingEvent[] }> {
  return req(`/group/${groupId}/events?since=${sinceSeq}`);
}
