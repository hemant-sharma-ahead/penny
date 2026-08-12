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

/** Writes every non-duplicate, non-skipped row, tolerating individual failures. */
export async function writeImportBatch(rows: ResolvedPreviewRow[]): Promise<ImportWriteResult> {
  const succeededIds: string[] = [];
  const failed: FailedImportRow[] = [];

  for (const row of rows) {
    if (row.duplicate || row.skipped) continue;
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
    } catch (err) {
      failed.push({ row, error: err instanceof Error ? err.message : 'Could not save this row' });
    }
  }

  let activityLogId: string | null = null;
  if (succeededIds.length > 0) {
    // Awaited (not the usual fire-and-forget logActivity()) — undoImportBatch() may be called
    // immediately after this resolves, and needs the entry to definitely already exist.
    activityLogId = await logActivityAwaited({
      action: 'IMPORT',
      entityType: 'expense',
      entityId: 'import',
      summary: `Imported ${succeededIds.length} transaction${succeededIds.length === 1 ? '' : 's'}`,
      entityCount: succeededIds.length,
      snapshot: JSON.stringify(succeededIds)
    });
  }

  return { succeededCount: succeededIds.length, failed, activityLogId };
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
