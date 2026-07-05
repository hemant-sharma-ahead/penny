-- Penny Auth/Identity Worker — D1 schema (Phase 1.5 Track C).
-- Identity metadata ONLY. The server never stores financial data, PII, or a personal backup blob
-- (Model B: personal backup lives in the user's own Drive/iCloud). See docs/BACKEND_STRATEGY.md §5.

-- One row per user, anchored by the client's existing Profile.userId (a UUID). The username is
-- optional and, when present, globally unique (first-claim-wins via the UNIQUE constraint).
CREATE TABLE IF NOT EXISTS users (
  user_id     TEXT PRIMARY KEY,   -- = client Profile.userId (UUID)
  username    TEXT UNIQUE,        -- optional/nullable; public sharing handle
  signing_key TEXT NOT NULL,      -- account-level ECDSA P-256 public JWK
  kdf_salt    TEXT,               -- optional; NOT used by Model B recovery (Drive-based)
  created_at  INTEGER NOT NULL,   -- epoch ms
  updated_at  INTEGER NOT NULL    -- epoch ms
);

-- One row per device. The signing key verifies that device's signed requests; the wrapping key
-- receives the DMK (device pairing) and Group Keys (grants) in later tracks — public halves only.
CREATE TABLE IF NOT EXISTS devices (
  device_id    TEXT PRIMARY KEY,  -- random UUID per device
  user_id      TEXT NOT NULL,     -- FK → users.user_id (app-level)
  signing_key  TEXT NOT NULL,     -- this device's ECDSA P-256 public JWK
  wrapping_key TEXT NOT NULL,     -- this device's ECDH P-256 public JWK
  label        TEXT,
  created_at   INTEGER NOT NULL,  -- epoch ms
  revoked_at   INTEGER            -- epoch ms; NULL = active
);

CREATE INDEX IF NOT EXISTS idx_devices_user ON devices (user_id);
