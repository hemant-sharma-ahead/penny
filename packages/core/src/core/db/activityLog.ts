// Activity-log service (Track 4). The single entry point for recording user-initiated
// data changes and restoring deletions. Logging is fire-and-forget: it never throws into
// the caller and never blocks a mutation.
import { activityLogRepo } from './repositories';
import { RESTORE_PUT } from './entityRegistry';
import type { ActivityAction, ActivityLog } from './types';

const MAX_ENTRIES = 500;
let pruning = false;

export interface LogActivityInput {
  action: ActivityAction;
  entityType: string;
  entityId: string;
  summary: string;
  actor?: string;
  snapshot?: string;
  cascade?: string;
  diff?: string;
  entityCount?: number;
  restorePointId?: string;
}

// ─── Change signal ──────────────────────────────────────────────────────────
// A tiny synchronous emitter so background services (e.g. the Track D backup engine) can react to
// "meaningful change" without polling. Generic — no dependency on any consumer.
type ActivityListener = (entry: ActivityLog) => void;
const listeners = new Set<ActivityListener>();

/** Subscribe to activity entries as they're logged. Returns an unsubscribe function. */
export function subscribeActivity(listener: ActivityListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Record an activity entry. Returns the new id synchronously (for Undo wiring); writes in the background. */
export function logActivity(input: LogActivityInput): string {
  const id = crypto.randomUUID();
  const entry: ActivityLog = { id, timestamp: Date.now(), ...input };
  void activityLogRepo
    .put(entry)
    .then(() => prune())
    .catch(() => {
      /* logging must never disrupt the user action */
    });
  // Notify subscribers synchronously; a listener must never throw into the caller.
  for (const listener of listeners) {
    try {
      listener(entry);
    } catch {
      /* a broken listener must not disrupt the user action */
    }
  }
  return id;
}

/** Keep only the newest MAX_ENTRIES entries. */
async function prune(): Promise<void> {
  if (pruning) return;
  pruning = true;
  try {
    if ((await activityLogRepo.count()) <= MAX_ENTRIES) return;
    const all = await activityLogRepo.getAll();
    all.sort((a, b) => a.timestamp - b.timestamp); // oldest first
    const excess = all.slice(0, all.length - MAX_ENTRIES);
    await Promise.all(excess.map((e) => activityLogRepo.delete(e.id)));
  } catch {
    /* ignore */
  } finally {
    pruning = false;
  }
}

/** Re-insert the snapshotted record(s) for a DELETE/BULK_DELETE entry and mark it restored. */
export async function restoreActivity(logId: string): Promise<boolean> {
  const entry = await activityLogRepo.get(logId);
  if (!entry?.snapshot || entry.restored) return false;
  const put = RESTORE_PUT[entry.entityType];
  if (!put) return false;
  const data: unknown = JSON.parse(entry.snapshot);
  const records = Array.isArray(data) ? data : [data];
  await Promise.all(records.map((r) => put(r)));
  // Restore any records of other entity types that were cascade-deleted alongside this one
  // (e.g. the IOU ledger entries an expense seeded), so a single Undo is atomic.
  if (entry.cascade) {
    const cascade = JSON.parse(entry.cascade) as Array<{ entityType: string; record: unknown }>;
    await Promise.all(cascade.map(({ entityType, record }) => RESTORE_PUT[entityType]?.(record)));
  }
  await activityLogRepo.put({ ...entry, restored: true });
  return true;
}

/** Restore every not-yet-restored deletion at/after a checkpoint timestamp. Returns records restored. */
export async function restoreDeletionsSince(timestampInclusive: number): Promise<number> {
  const all = await activityLogRepo.getAll();
  const targets = all.filter(
    (e) =>
      e.timestamp >= timestampInclusive &&
      !e.restored &&
      e.snapshot &&
      (e.action === 'DELETE' || e.action === 'BULK_DELETE')
  );
  let count = 0;
  for (const e of targets) {
    if (await restoreActivity(e.id)) count += e.entityCount ?? 1;
  }
  return count;
}

/** Shallow before/after diff over the given fields → JSON `{ field: [before, after] }` (or undefined). */
export function summarizeDiff<T>(before: T, after: T, fields: (keyof T)[]): string | undefined {
  const diff: Record<string, [unknown, unknown]> = {};
  for (const f of fields) {
    if (before[f] !== after[f]) diff[String(f)] = [before[f], after[f]];
  }
  return Object.keys(diff).length > 0 ? JSON.stringify(diff) : undefined;
}
