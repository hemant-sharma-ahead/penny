// D1 queries for the auth worker — users + devices. Schema in migrations/0001_init.sql.

export interface UserRow {
  user_id: string;
  username: string | null;
  signing_key: string;
  kdf_salt: string | null;
  created_at: number;
  updated_at: number;
}

export interface DeviceRow {
  device_id: string;
  user_id: string;
  signing_key: string;
  wrapping_key: string;
  label: string | null;
  created_at: number;
  revoked_at: number | null;
}

export function getUser(db: D1Database, userId: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE user_id = ?').bind(userId).first<UserRow>();
}

/** The user_id currently holding a username, or null if free. Used for availability + claim races. */
export async function userIdForUsername(db: D1Database, username: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT user_id FROM users WHERE username = ?')
    .bind(username)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

/** Upsert a user by user_id (idempotent re-register / relabel). Caller guarantees username is free. */
export async function upsertUser(
  db: D1Database,
  u: { userId: string; username: string | null; signingKey: string; kdfSalt: string | null; now: number }
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO users (user_id, username, signing_key, kdf_salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, signing_key = excluded.signing_key, ' +
        'kdf_salt = excluded.kdf_salt, updated_at = excluded.updated_at'
    )
    .bind(u.userId, u.username, u.signingKey, u.kdfSalt, u.now, u.now)
    .run();
}

export function getDevice(db: D1Database, deviceId: string): Promise<DeviceRow | null> {
  return db.prepare('SELECT * FROM devices WHERE device_id = ?').bind(deviceId).first<DeviceRow>();
}

/** Upsert a device by device_id (idempotent — re-register updates its keys/label). */
export async function upsertDevice(
  db: D1Database,
  d: { deviceId: string; userId: string; signingKey: string; wrappingKey: string; label: string | null; now: number }
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO devices (device_id, user_id, signing_key, wrapping_key, label, created_at) VALUES (?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT(device_id) DO UPDATE SET signing_key = excluded.signing_key, ' +
        'wrapping_key = excluded.wrapping_key, label = excluded.label'
    )
    .bind(d.deviceId, d.userId, d.signingKey, d.wrappingKey, d.label, d.now)
    .run();
}
