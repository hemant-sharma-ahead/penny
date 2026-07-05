// Pure group business logic — no Cloudflare bindings, so it unit-tests directly (mirrors the way
// workers/auth keeps its pure helpers in lib/). Role checks, invite validity, and the small
// validators the route handlers lean on.

export type GroupRole = 'owner' | 'admin' | 'member';
export type GroupStatus = 'active' | 'closed';
export type GroupType = 'family' | 'trip' | 'roommates' | 'other';
export type HistoryVisibility = 'full' | 'from_join';

const GROUP_TYPES: readonly GroupType[] = ['family', 'trip', 'roommates', 'other'];
const HISTORY_VISIBILITIES: readonly HistoryVisibility[] = ['full', 'from_join'];
const ROLES: readonly GroupRole[] = ['owner', 'admin', 'member'];

export function isGroupType(v: unknown): v is GroupType {
  return typeof v === 'string' && (GROUP_TYPES as readonly string[]).includes(v);
}
export function isHistoryVisibility(v: unknown): v is HistoryVisibility {
  return typeof v === 'string' && (HISTORY_VISIBILITIES as readonly string[]).includes(v);
}
export function isRole(v: unknown): v is GroupRole {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v);
}

/** Owners and admins may invite, grant keys, and manage other members. Plain members may not. */
export function canManageMembers(role: GroupRole): boolean {
  return role === 'owner' || role === 'admin';
}

/** Only the owner (or an admin) may close/reopen the group and transfer ownership. */
export function canCloseGroup(role: GroupRole): boolean {
  return role === 'owner' || role === 'admin';
}

/** Only the owner may grant admin/owner roles or transfer ownership. */
export function canAssignRole(actor: GroupRole, target: GroupRole): boolean {
  if (actor === 'owner') return true;
  // Admins may only manage plain members, never (de)promote admins/owners.
  return actor === 'admin' && target === 'member';
}

export interface InviteRow {
  token_hash: string;
  group_id: string;
  role: string;
  expires_at: number;
  max_uses: number;
  uses: number;
  revoked: number;
  created_by: string;
  created_at: number;
}

/** An invite is redeemable when not revoked, not expired, and still has uses remaining. */
export function isInviteRedeemable(row: InviteRow, now: number): boolean {
  return row.revoked === 0 && row.expires_at > now && row.uses < row.max_uses;
}

/** Which epochs a joiner should be granted, given the group's current epoch + its visibility policy. */
export function grantableEpochs(currentEpoch: number, visibility: HistoryVisibility): number[] {
  if (visibility === 'from_join') return [currentEpoch];
  const epochs: number[] = [];
  for (let e = 1; e <= currentEpoch; e++) epochs.push(e);
  return epochs;
}

/** A token TTL clamped to sane bounds (min 5 min, max 30 days), in epoch ms. */
export function clampInviteExpiry(requestedMs: number, now: number): number {
  const MIN = 5 * 60_000;
  const MAX = 30 * 24 * 60 * 60_000;
  const delta = Math.max(MIN, Math.min(MAX, requestedMs - now));
  return now + delta;
}
