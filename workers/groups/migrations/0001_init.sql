-- Penny Groups Worker — D1 schema (Phase 1.5 Track E).
-- Group metadata + membership + invites + key-grants + an event index. CIPHERTEXT ONLY: the group
-- name is stored encrypted (enc_name), event bodies live in R2 as AES-GCM ciphertext, and key grants
-- are wrapped to a member's ECDH public key. The server never sees plaintext financial data, member
-- names, or Group Keys (Model B). See docs/BACKEND_STRATEGY.md §5 and docs/plans/phase-1.5-track-E-groups.md.

-- One row per group. `enc_name` is AES-GCM(GroupKey, name); the server can't read it. `key_epoch`
-- bumps on every membership rotation (leave). `history_visibility` gates which epochs a joiner is granted.
CREATE TABLE IF NOT EXISTS groups (
  group_id           TEXT PRIMARY KEY,   -- random UUID
  type               TEXT NOT NULL,      -- family | trip | roommates | other
  enc_name           TEXT NOT NULL,      -- AES-GCM(GroupKey_epoch, name) — ciphertext
  owner_id           TEXT NOT NULL,      -- FK → auth users.user_id (app-level)
  key_epoch          INTEGER NOT NULL DEFAULT 1,
  history_visibility TEXT NOT NULL DEFAULT 'from_join', -- full | from_join
  status             TEXT NOT NULL DEFAULT 'active',     -- active | closed
  created_at         INTEGER NOT NULL,   -- epoch ms
  updated_at         INTEGER NOT NULL    -- epoch ms
);

-- One row per (group, member). `role` gates management; `status` supports leave/rejoin (mute is local).
CREATE TABLE IF NOT EXISTS group_members (
  group_id  TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  role      TEXT NOT NULL DEFAULT 'member', -- owner | admin | member
  status    TEXT NOT NULL DEFAULT 'active', -- active | left
  joined_at INTEGER NOT NULL,               -- epoch ms
  left_at   INTEGER,                        -- epoch ms; NULL = active
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members (user_id);

-- Invites. Only SHA-256(secret) is stored — the raw secret lives solely in the share link/QR, and the
-- Group Key is never in the invite (the key arrives later as a wrapped grant). Single- or multi-use.
CREATE TABLE IF NOT EXISTS invites (
  token_hash TEXT PRIMARY KEY,  -- SHA-256(secret), hex
  group_id   TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'member',
  expires_at INTEGER NOT NULL,  -- epoch ms
  max_uses   INTEGER NOT NULL DEFAULT 1,
  uses       INTEGER NOT NULL DEFAULT 0,
  revoked    INTEGER NOT NULL DEFAULT 0, -- 0 | 1
  created_by TEXT NOT NULL,     -- user_id of the inviter
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invites_group ON invites (group_id);

-- Key grants: the Group Key at a given epoch, wrapped to a member's ECDH wrapping public key. The
-- wrapped_key blob carries the granter's wrapping public JWK + the wrapped bytes (see keys.ts); the
-- server relays it opaquely. One row per (group, member, epoch) so history-visibility can grant many.
CREATE TABLE IF NOT EXISTS group_key_grants (
  group_id    TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  key_epoch   INTEGER NOT NULL,
  wrapped_key TEXT NOT NULL,  -- opaque ciphertext envelope (JSON: granterWrapPub + wrapped)
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id, key_epoch)
);

-- Event index (bodies in R2 at gevent/{group_id}/{seq}). `seq` is the server-assigned total order;
-- `lamport` is the client logical clock for tie-breaking. `r2_key` points at the ciphertext blob.
CREATE TABLE IF NOT EXISTS group_events (
  group_id  TEXT NOT NULL,
  seq       INTEGER NOT NULL,   -- server-assigned, monotonic per group
  event_id  TEXT NOT NULL,      -- client UUID (idempotency)
  author_id TEXT NOT NULL,
  key_epoch INTEGER NOT NULL,
  r2_key    TEXT NOT NULL,
  lamport   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, seq)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_group_events_eventid ON group_events (group_id, event_id);
