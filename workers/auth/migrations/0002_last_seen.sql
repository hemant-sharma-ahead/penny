-- Account lifecycle: track last authenticated activity so the inactivity GC (Cron) can reclaim
-- orphaned accounts/usernames whose device keys are permanently lost (no backup, no other device).
-- Bumped on every signed request; seeded from updated_at for existing rows.
ALTER TABLE users ADD COLUMN last_seen INTEGER;
UPDATE users SET last_seen = updated_at WHERE last_seen IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users (last_seen);
