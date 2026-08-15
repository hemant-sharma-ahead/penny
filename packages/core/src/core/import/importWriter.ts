// Writes a resolved import batch to the DB (packages/core/src/core/import/) and supports undoing the
// whole batch afterward. Two things fixed here vs. the legacy pipeline's inline write loop (2026-07-28):
//
// 1. Partial-success tolerance: each row is written independently in its own try/catch. One row
//    throwing (e.g. an encryption error) no longer blocks or "loses" every other row in the batch, and
//    never leaves the UI stuck on an unresolvable "Importing…" — the caller gets back exactly which
//    rows succeeded and which failed (with a reason), so it can report "M imported, F failed" and let
//    the user retry just the failures.
// 2. Real undo: the activity-log entry's snapshot is the list of *created expense ids* (not a
//    before-state to restore) — undoImportBatch() deletes them. This is the opposite direction from
//    activityLog.ts's generic restoreActivity() (which re-inserts a snapshot to undo a delete), so it's
//    a distinct function rather than an extension of that one.
//
// undoImportBatch() v2 (2026-08-06, per explicit user feedback): undoing no longer silently mutates the
// original IMPORT entry in place with no visible trace of when it happened — a Timeline that only ever
// edits its own history stops reading as a timeline. It now:
//   (a) snapshots the FULL expense records (not just ids) before deleting them, so the deletion is
//       genuinely undoable — previously it only ever stored ids (enough to find what to delete, not
//       enough to bring anything back), unlike every other delete-style action in the app.
//   (b) logs a NEW, dated 'UNDO_IMPORT' entry carrying that snapshot — reusing restoreActivity()'s
//       existing generic snapshot/restore machinery (via entityRegistry's RESTORE_PUT), rather than
//       inventing a second bespoke restore path. This means "Undo an import" and "restore what an Undo
//       removed" are now symmetric with how every other bulk delete in this app already works.
//   (c) links the two entries via relatedLogId in both directions, so restoring the UNDO_IMPORT entry
//       can flip the original IMPORT entry's `restored` back to false — its own Undo button reappears,
//       so the whole thing can be undone-and-redone-and-undone-again without any dead ends.
import { expensesRepo, activityLogRepo } from '@/core/db/repositories';
import { logActivityAwaited, restoreActivity } from '@/core/db/activityLog';
import type { ResolvedPreviewRow } from './importPipeline';

export interface FailedImportRow {
  row: ResolvedPreviewRow;
  error: string;
}

export interface ImportWriteResult {
  succeededCount: number;
  failed: FailedImportRow[];
  /** The activity-log entry id for this batch (only set if at least one row succeeded) — pass to
   *  undoImportBatch() to undo the whole batch. */
  activityLogId: string | null;
}

interface WriteLoopResult {
  succeededIds: string[];
  /** Each successfully-written row paired with its newly-created expense id — only populated for
   *  `writeImportBatchDetailed` below; `writeImportBatch` itself never reads this field, so its own
   *  external behavior (and `apps/web-react`'s frozen direct call to it) is completely unchanged by this
   *  2026-08-14 refactor. */
  succeededRows: { row: ResolvedPreviewRow; expenseId: string }[];
  failed: FailedImportRow[];
  /** `true` only when `options.shouldCancel` returned `true` and stopped the loop before every writable
   *  row was attempted — always `false` for `writeImportBatch` (never passes `options` at all). */
  cancelled: boolean;
}

/** Optional live-progress/cancellation hooks (2026-08-14, Import Progress screen —
 *  docs/plans/csv-expense-import-redesign.md §14 item 8) — additive only, `writeImportBatch`'s own
 *  signature/behavior stays untouched (it never passes these); only apps/mobile's
 *  `writeImportBatchDetailed` call site uses them. */
export interface WriteRowsOptions {
  /** Called after each row write attempt (success or failure) — never for a duplicate/skipped row,
   *  since those are excluded from `total` entirely (they were never going to be written). May be
   *  throttled for a large batch; always called once more with `completed === total` at the very end
   *  (or at whatever `completed` the loop had reached when cancelled). */
  onProgress?: (completed: number, total: number) => void;
  /** Polled once before each row write attempt — returning `true` stops the loop immediately, before
   *  writing another row. Whatever already succeeded stays written (independent per-row commits, same
   *  partial-tolerance this file's header comment already documents for a genuine write failure). */
  shouldCancel?: () => boolean;
}

/** Shared write loop — extracted 2026-08-14 (CSV-import redesign Chunk B) so the new
 *  `writeImportBatchDetailed` below (which also needs each row's created expense id, for apps/mobile's
 *  new IOU `ledger_entries` write) can reuse the exact same per-row try/catch logic as `writeImportBatch`
 *  without duplicating it. `writeImportBatch`'s own behavior is unchanged — it calls this with the exact
 *  same loop body it always had (no `options`, so `onProgress`/`shouldCancel` are simply never invoked
 *  and `cancelled` is always `false`). */
async function writeRows(rows: ResolvedPreviewRow[], options?: WriteRowsOptions): Promise<WriteLoopResult> {
  const succeededIds: string[] = [];
  const succeededRows: { row: ResolvedPreviewRow; expenseId: string }[] = [];
  const failed: FailedImportRow[] = [];

  // Filtered upfront (rather than `continue`-ing past a duplicate/skipped row inline, as this loop used
  // to) so `total` below is the real count of rows this run will actually attempt — exactly what a live
  // progress display needs. Purely a restructuring, not a behavior change: iterating the filtered list
  // writes the identical set of rows as before.
  const writable = rows.filter((row) => !row.duplicate && !row.skipped);
  const total = writable.length;
  let completed = 0;
  let cancelled = false;
  let lastProgressAt = 0;

  for (const row of writable) {
    // `shouldCancel`/`onProgress` (below) are caller-supplied UI hooks (2026-08-14, Import Progress
    // screen) — a bug in either must never itself abort the write loop or escape this function. Without
    // this guard, a throwing callback would propagate straight out of `writeRows`/
    // `writeImportBatchDetailed`, silently truncating however many rows hadn't been attempted yet (a
    // real, if lower-severity, sibling of the "caller's importPhase state gets stuck" bug this same day's
    // round fixed at the `commitAndImport()` call-site level — belt-and-suspenders here, not redundant:
    // this stops the write itself from being cut short, independent of whatever the caller does with the
    // exception). Deliberately swallowed with no logging — `no-console` is one of CLAUDE.md's
    // non-negotiable ESLint rules here, never disabled with an inline comment — the write loop simply
    // continues writing the rest of `writable` as if this one signal was never sent; the caller's own
    // (separately hardened) exception handling is the right place for anything genuinely worth surfacing
    // to the user.
    let shouldStop = false;
    try {
      shouldStop = options?.shouldCancel?.() ?? false;
    } catch {
      // Deliberately swallowed — see the doc comment above; treat a throwing `shouldCancel` as "don't
      // stop", the same as if it simply hadn't been provided at all.
    }
    if (shouldStop) {
      cancelled = true;
      break;
    }
    const id = crypto.randomUUID();
    try {
      const now = Date.now();
      await expensesRepo.put({
        id,
        amount: row.amount,
        categoryId: row.categoryId,
        description: row.description,
        date: row.date,
        hashtags: row.hashtags,
        isRecurring: false,
        accountId: row.accountId,
        ...(row.toAccountId && { toAccountId: row.toAccountId }),
        ...(row.paymentMode && { paymentMode: row.paymentMode }),
        ...(row.notes && { notes: row.notes }),
        type: row.type,
        source: 'import',
        sourceRef: row.sourceRef,
        createdAt: now,
        updatedAt: now
      });
      succeededIds.push(id);
      succeededRows.push({ row, expenseId: id });
    } catch (err) {
      failed.push({ row, error: err instanceof Error ? err.message : 'Could not save this row' });
    }
    completed++;
    const now = Date.now();
    if (options?.onProgress && (completed === total || now - lastProgressAt >= 80)) {
      lastProgressAt = now;
      try {
        options.onProgress(completed, total);
      } catch {
        // Deliberately swallowed — see the `shouldCancel` guard's doc comment above.
      }
    }
  }

  return { succeededIds, succeededRows, failed, cancelled };
}

async function logImportBatch(succeededIds: string[]): Promise<string | null> {
  if (succeededIds.length === 0) return null;
  // Awaited (not the usual fire-and-forget logActivity()) — undoImportBatch() may be called
  // immediately after this resolves, and needs the entry to definitely already exist.
  return logActivityAwaited({
    action: 'IMPORT',
    entityType: 'expense',
    entityId: 'import',
    summary: `Imported ${succeededIds.length} transaction${succeededIds.length === 1 ? '' : 's'}`,
    entityCount: succeededIds.length,
    snapshot: JSON.stringify(succeededIds)
  });
}

/** Writes every non-duplicate, non-skipped row, tolerating individual failures. */
export async function writeImportBatch(rows: ResolvedPreviewRow[]): Promise<ImportWriteResult> {
  const { succeededIds, failed } = await writeRows(rows);
  const activityLogId = await logImportBatch(succeededIds);
  return { succeededCount: succeededIds.length, failed, activityLogId };
}

export interface ImportWriteDetailedResult extends ImportWriteResult {
  /** Every row that WAS successfully written, paired with its newly-created expense id — needed by
   *  apps/mobile's new Categories-stage IOU commit step (resolving a `Person` + writing a
   *  `ledger_entries` row per IOU-mandatory-category row, mirroring `useBankImport.ts`'s existing
   *  commit-time equivalent). Absent from `writeImportBatch` since nothing needed it before this. */
  succeededRows: { row: ResolvedPreviewRow; expenseId: string }[];
  /** `true` when `options.shouldCancel` stopped the write loop early (2026-08-14, Import Progress
   *  screen) — whatever succeeded before that point is still durably written and still reflected in
   *  `succeededCount`/`succeededRows`; this only signals that the REST of `rows` was never attempted. */
  cancelled: boolean;
}

/** Same write as `writeImportBatch`, plus each succeeded row's created expense id (2026-08-14, CSV-
 *  import redesign Chunk B) and, as of the same day's Import Progress screen (§14 item 8), optional live
 *  progress/cancellation — a NEW, additive sibling, not a modification of `writeImportBatch` itself
 *  (which `apps/web-react`'s frozen `useImport.ts` calls directly and keeps calling unchanged). */
export async function writeImportBatchDetailed(
  rows: ResolvedPreviewRow[],
  options?: WriteRowsOptions
): Promise<ImportWriteDetailedResult> {
  const { succeededIds, succeededRows, failed, cancelled } = await writeRows(rows, options);
  const activityLogId = await logImportBatch(succeededIds);
  return { succeededCount: succeededIds.length, failed, activityLogId, succeededRows, cancelled };
}

/** Undoes a whole import batch: fetches the full expense records (not just ids — needed so the
 *  deletion is itself undoable, see this file's header comment), deletes them, marks the original
 *  IMPORT entry `restored`, and logs a new dated 'UNDO_IMPORT' entry — carrying the full records as its
 *  own snapshot — that the Timeline's usual restore machinery (`restoreActivity`) can bring back later,
 *  same as any other bulk delete. Returns how many were deleted, or 0 if the entry is missing/already
 *  undone/not an IMPORT entry. */
export async function undoImportBatch(logId: string): Promise<number> {
  const entry = await activityLogRepo.get(logId);
  if (!entry || entry.action !== 'IMPORT' || entry.restored || !entry.snapshot) return 0;
  const ids = JSON.parse(entry.snapshot) as string[];
  const records = (await Promise.all(ids.map((id) => expensesRepo.get(id)))).filter(
    (e): e is NonNullable<typeof e> => !!e
  );
  if (records.length === 0) {
    // Nothing left to actually delete (e.g. every one of these was already individually removed since)
    // — still mark the IMPORT entry restored so its Undo button stops offering a no-op, but there's
    // nothing to log an undoable UNDO_IMPORT entry for.
    await activityLogRepo.put({ ...entry, restored: true });
    return 0;
  }
  await Promise.all(records.map((e) => expensesRepo.delete(e.id)));

  const undoLogId = await logActivityAwaited({
    action: 'UNDO_IMPORT',
    entityType: 'expense',
    entityId: 'import',
    summary: `Undid import: removed ${records.length} transaction${records.length === 1 ? '' : 's'}`,
    entityCount: records.length,
    snapshot: JSON.stringify(records),
    relatedLogId: entry.id
  });
  await activityLogRepo.put({ ...entry, restored: true, relatedLogId: undoLogId });
  return records.length;
}

/** Reverses a Timeline-triggered import undo: restores every expense the UNDO_IMPORT entry removed
 *  (via the same generic `restoreActivity` every other delete uses), then — since that necessarily also
 *  brings the whole batch back into existence — flips the ORIGINAL IMPORT entry's `restored` back to
 *  `false` via `relatedLogId`, so its own Undo button correctly reappears (the batch is undoable again).
 *  Symmetric with `undoImportBatch` above. Returns true if anything was actually restored. */
export async function restoreUndoneImport(undoLogId: string): Promise<boolean> {
  const restored = await restoreActivity(undoLogId);
  if (!restored) return false;
  const undoEntry = await activityLogRepo.get(undoLogId);
  if (undoEntry?.relatedLogId) {
    const original = await activityLogRepo.get(undoEntry.relatedLogId);
    if (original) await activityLogRepo.put({ ...original, restored: false });
  }
  return true;
}
