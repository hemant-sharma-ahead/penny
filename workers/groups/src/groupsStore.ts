// D1 queries for the groups worker. Schema in migrations/0001_init.sql.
// The device signing-key lookup reads the auth worker's `devices` table via the AUTH_DB binding
// (read-only) — the groups worker never writes identity metadata.

export interface GroupRow {
  group_id: string;
  type: string;
  enc_name: string;
  owner_id: string;
  key_epoch: number;
  history_visibility: string;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface MemberRow {
  group_id: string;
  user_id: string;
  role: string;
  status: string;
  joined_at: number;
  left_at: number | null;
}

export interface EventRow {
  group_id: string;
  seq: number;
  event_id: string;
  author_id: string;
  key_epoch: number;
  ciphertext: string; // base64(iv||AES-GCM ciphertext) — opaque to the server, stored inline in D1
  lamport: number;
  created_at: number;
}

// ─── Device key lookup (auth DB, read-only) ────────────────────────────────────

export async function getDeviceSigningKey(
  authDb: D1Database,
  deviceId: string
): Promise<{ userId: string; signingKey: string; revoked: boolean } | null> {
  const row = await authDb
    .prepare('SELECT user_id, signing_key, revoked_at FROM devices WHERE device_id = ?')
    .bind(deviceId)
    .first<{ user_id: string; signing_key: string; revoked_at: number | null }>();
  if (!row) return null;
  return { userId: row.user_id, signingKey: row.signing_key, revoked: row.revoked_at !== null };
}

/** A user's ECDH wrapping public JWK — the most recently registered active device. Used so an admin
 *  can wrap the Group Key for a newly-joined member. Null if the user has no active device. */
export async function getUserWrappingKey(authDb: D1Database, userId: string): Promise<string | null> {
  const row = await authDb
    .prepare(
      'SELECT wrapping_key FROM devices WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1'
    )
    .bind(userId)
    .first<{ wrapping_key: string }>();
  return row?.wrapping_key ?? null;
}

// ─── Groups ────────────────────────────────────────────────────────────────────

export function getGroup(db: D1Database, groupId: string): Promise<GroupRow | null> {
  return db.prepare('SELECT * FROM groups WHERE group_id = ?').bind(groupId).first<GroupRow>();
}

export async function insertGroup(
  db: D1Database,
  g: { groupId: string; type: string; encName: string; ownerId: string; historyVisibility: string; now: number }
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO groups (group_id, type, enc_name, owner_id, key_epoch, history_visibility, status, created_at, updated_at) ' +
        "VALUES (?, ?, ?, ?, 1, ?, 'active', ?, ?)"
    )
    .bind(g.groupId, g.type, g.encName, g.ownerId, g.historyVisibility, g.now, g.now)
    .run();
}

export async function setGroupStatus(db: D1Database, groupId: string, status: string, now: number): Promise<void> {
  await db.prepare('UPDATE groups SET status = ?, updated_at = ? WHERE group_id = ?').bind(status, now, groupId).run();
}

export async function setGroupEncName(db: D1Database, groupId: string, encName: string, now: number): Promise<void> {
  await db
    .prepare('UPDATE groups SET enc_name = ?, updated_at = ? WHERE group_id = ?')
    .bind(encName, now, groupId)
    .run();
}

/** Delete a group and every row that references it — no FK cascades in this schema, so each table is
 *  cleared explicitly. Creator-only + emptiness are enforced by the caller (index.ts's
 *  `handleDeleteGroup`) before this runs. */
export async function deleteGroup(db: D1Database, groupId: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM group_events WHERE group_id = ?').bind(groupId),
    db.prepare('DELETE FROM group_key_grants WHERE group_id = ?').bind(groupId),
    db.prepare('DELETE FROM invites WHERE group_id = ?').bind(groupId),
    db.prepare('DELETE FROM group_members WHERE group_id = ?').bind(groupId),
    db.prepare('DELETE FROM groups WHERE group_id = ?').bind(groupId)
  ]);
}

export async function bumpGroupEpoch(db: D1Database, groupId: string, now: number): Promise<number> {
  await db
    .prepare('UPDATE groups SET key_epoch = key_epoch + 1, updated_at = ? WHERE group_id = ?')
    .bind(now, groupId)
    .run();
  const row = await db
    .prepare('SELECT key_epoch FROM groups WHERE group_id = ?')
    .bind(groupId)
    .first<{ key_epoch: number }>();
  return row?.key_epoch ?? 1;
}

// ─── Members ─────────────────────────────────────────────────────────────────────

export function getMember(db: D1Database, groupId: string, userId: string): Promise<MemberRow | null> {
  return db
    .prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?')
    .bind(groupId, userId)
    .first<MemberRow>();
}

export async function listMembers(db: D1Database, groupId: string): Promise<MemberRow[]> {
  const res = await db
    .prepare('SELECT * FROM group_members WHERE group_id = ? ORDER BY joined_at')
    .bind(groupId)
    .all<MemberRow>();
  return res.results ?? [];
}

export async function upsertMember(
  db: D1Database,
  m: { groupId: string; userId: string; role: string; now: number }
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO group_members (group_id, user_id, role, status, joined_at, left_at) VALUES (?, ?, ?, 'active', ?, NULL) " +
        "ON CONFLICT(group_id, user_id) DO UPDATE SET role = excluded.role, status = 'active', left_at = NULL"
    )
    .bind(m.groupId, m.userId, m.role, m.now)
    .run();
}

export async function setMemberStatus(
  db: D1Database,
  groupId: string,
  userId: string,
  status: string,
  now: number
): Promise<void> {
  const leftAt = status === 'left' ? now : null;
  await db
    .prepare('UPDATE group_members SET status = ?, left_at = ? WHERE group_id = ? AND user_id = ?')
    .bind(status, leftAt, groupId, userId)
    .run();
}

export async function setMemberRole(db: D1Database, groupId: string, userId: string, role: string): Promise<void> {
  await db
    .prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?')
    .bind(role, groupId, userId)
    .run();
}

// ─── Invites ─────────────────────────────────────────────────────────────────────

export function getInvite(db: D1Database, tokenHash: string): Promise<import('./lib/membership').InviteRow | null> {
  return db.prepare('SELECT * FROM invites WHERE token_hash = ?').bind(tokenHash).first();
}

export async function insertInvite(
  db: D1Database,
  i: {
    tokenHash: string;
    groupId: string;
    role: string;
    expiresAt: number;
    maxUses: number;
    createdBy: string;
    now: number;
  }
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO invites (token_hash, group_id, role, expires_at, max_uses, uses, revoked, created_by, created_at) ' +
        'VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)'
    )
    .bind(i.tokenHash, i.groupId, i.role, i.expiresAt, i.maxUses, i.createdBy, i.now)
    .run();
}

export async function incrementInviteUses(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare('UPDATE invites SET uses = uses + 1 WHERE token_hash = ?').bind(tokenHash).run();
}

export async function revokeInvite(db: D1Database, tokenHash: string, groupId: string): Promise<void> {
  await db
    .prepare('UPDATE invites SET revoked = 1 WHERE token_hash = ? AND group_id = ?')
    .bind(tokenHash, groupId)
    .run();
}

// ─── Key grants ────────────────────────────────────────────────────────────────

export async function putGrant(
  db: D1Database,
  g: { groupId: string; userId: string; keyEpoch: number; wrappedKey: string; now: number }
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO group_key_grants (group_id, user_id, key_epoch, wrapped_key, created_at) VALUES (?, ?, ?, ?, ?) ' +
        'ON CONFLICT(group_id, user_id, key_epoch) DO UPDATE SET wrapped_key = excluded.wrapped_key'
    )
    .bind(g.groupId, g.userId, g.keyEpoch, g.wrappedKey, g.now)
    .run();
}

export async function listGrantsForUser(
  db: D1Database,
  groupId: string,
  userId: string
): Promise<{ key_epoch: number; wrapped_key: string }[]> {
  const res = await db
    .prepare(
      'SELECT key_epoch, wrapped_key FROM group_key_grants WHERE group_id = ? AND user_id = ? ORDER BY key_epoch'
    )
    .bind(groupId, userId)
    .all<{ key_epoch: number; wrapped_key: string }>();
  return res.results ?? [];
}

// ─── Events ──────────────────────────────────────────────────────────────────────

/** Append an event with a server-assigned monotonic seq. Idempotent on (group_id, event_id).
 *  The encrypted body is stored inline in D1 (`ciphertext`) — no R2 needed for these small blobs. */
export async function appendEvent(
  db: D1Database,
  e: {
    groupId: string;
    eventId: string;
    authorId: string;
    keyEpoch: number;
    ciphertext: string;
    lamport: number;
    now: number;
  }
): Promise<{ seq: number; deduped: boolean }> {
  const existing = await db
    .prepare('SELECT seq FROM group_events WHERE group_id = ? AND event_id = ?')
    .bind(e.groupId, e.eventId)
    .first<{ seq: number }>();
  if (existing) return { seq: existing.seq, deduped: true };

  const max = await db
    .prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM group_events WHERE group_id = ?')
    .bind(e.groupId)
    .first<{ m: number }>();
  const seq = (max?.m ?? 0) + 1;
  await db
    .prepare(
      'INSERT INTO group_events (group_id, seq, event_id, author_id, key_epoch, ciphertext, lamport, created_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(e.groupId, seq, e.eventId, e.authorId, e.keyEpoch, e.ciphertext, e.lamport, e.now)
    .run();
  return { seq, deduped: false };
}

export async function listEventsSince(
  db: D1Database,
  groupId: string,
  sinceSeq: number,
  limit = 500
): Promise<EventRow[]> {
  const res = await db
    .prepare('SELECT * FROM group_events WHERE group_id = ? AND seq > ? ORDER BY seq LIMIT ?')
    .bind(groupId, sinceSeq, limit)
    .all<EventRow>();
  return res.results ?? [];
}
