-- Penny API Proxy — D1 schema (vehicle permanent cache + queue + daily Vahan budget).

-- Permanent cache: make/model/registration don't change, so a reg is fetched upstream once and
-- served forever (re-adds + reinstalls are free).
CREATE TABLE IF NOT EXISTS vehicle_cache (
  regno      TEXT PRIMARY KEY,
  data       TEXT NOT NULL,      -- raw upstream JSON { rc, challans }
  fetched_at INTEGER NOT NULL    -- epoch ms
);

-- Per-reg queue: when the daily budget/window can't serve a miss, the reg is queued (deduped) and
-- the morning Cron drains it. One success serves every waiting user.
CREATE TABLE IF NOT EXISTS vehicle_queue (
  regno           TEXT PRIMARY KEY,
  requested_at    INTEGER NOT NULL, -- epoch ms (drain oldest-first)
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER
);

-- Daily upstream-call budget, bucketed by IST day key (YYYY-MM-DD). Counts CALLS (2 per fetch).
CREATE TABLE IF NOT EXISTS vahan_budget (
  day  TEXT PRIMARY KEY,
  used INTEGER NOT NULL DEFAULT 0
);
