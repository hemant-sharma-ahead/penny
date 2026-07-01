// D1-backed permanent vehicle cache + per-reg queue + daily Vahan budget counter.
// Schema in migrations/0001_init.sql.

export interface QueueRow {
  regno: string;
  attempts: number;
}

export async function getVehicle(db: D1Database, regno: string): Promise<unknown | null> {
  const row = await db.prepare('SELECT data FROM vehicle_cache WHERE regno = ?').bind(regno).first<{ data: string }>();
  return row ? JSON.parse(row.data) : null;
}

export async function putVehicle(db: D1Database, regno: string, data: unknown): Promise<void> {
  await db
    .prepare(
      'INSERT INTO vehicle_cache (regno, data, fetched_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(regno) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at'
    )
    .bind(regno, JSON.stringify(data), Date.now())
    .run();
}

/** Add a reg to the queue if not already present (dedup by PK) — many users → one entry → one fetch. */
export async function enqueue(db: D1Database, regno: string, nowMs: number): Promise<void> {
  await db
    .prepare('INSERT INTO vehicle_queue (regno, requested_at, attempts) VALUES (?, ?, 0) ON CONFLICT(regno) DO NOTHING')
    .bind(regno, nowMs)
    .run();
}

export async function dequeueBatch(db: D1Database, limit: number): Promise<QueueRow[]> {
  const rs = await db
    .prepare('SELECT regno, attempts FROM vehicle_queue ORDER BY requested_at ASC LIMIT ?')
    .bind(limit)
    .all<QueueRow>();
  return rs.results ?? [];
}

export async function removeFromQueue(db: D1Database, regno: string): Promise<void> {
  await db.prepare('DELETE FROM vehicle_queue WHERE regno = ?').bind(regno).run();
}

export async function bumpAttempt(db: D1Database, regno: string, nowMs: number): Promise<void> {
  await db
    .prepare('UPDATE vehicle_queue SET attempts = attempts + 1, last_attempt_at = ? WHERE regno = ?')
    .bind(nowMs, regno)
    .run();
}

export async function getBudget(db: D1Database, dayKey: string): Promise<number> {
  const row = await db.prepare('SELECT used FROM vahan_budget WHERE day = ?').bind(dayKey).first<{ used: number }>();
  return row?.used ?? 0;
}

/** Increment today's upstream-call counter by `n` and return the new total. */
export async function incBudget(db: D1Database, dayKey: string, n: number): Promise<number> {
  await db
    .prepare('INSERT INTO vahan_budget (day, used) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET used = used + ?')
    .bind(dayKey, n, n)
    .run();
  return getBudget(db, dayKey);
}
