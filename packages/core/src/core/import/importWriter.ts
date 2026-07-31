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
import { expensesRepo, activityLogRepo } from '@/core/db/repositories';
import { logActivityAwaited } from '@/core/db/activityLog';
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

/** Undoes a whole import batch by deleting every expense id recorded in its activity-log snapshot.
 *  Returns how many were deleted, or 0 if the entry is missing/already undone/not an IMPORT entry. */
export async function undoImportBatch(logId: string): Promise<number> {
  const entry = await activityLogRepo.get(logId);
  if (!entry || entry.action !== 'IMPORT' || entry.restored || !entry.snapshot) return 0;
  const ids = JSON.parse(entry.snapshot) as string[];
  await Promise.all(ids.map((id) => expensesRepo.delete(id)));
  await activityLogRepo.put({ ...entry, restored: true });
  return ids.length;
}
