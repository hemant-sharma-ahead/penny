import { useCallback, useEffect, useMemo } from 'react';
import { activityLogRepo } from '@/core/db/repositories';
import { restoreActivity, subscribeActivity } from '@/core/db/activityLog';
import { undoImportBatch, restoreUndoneImport } from '@/core/import/importWriter';
import type { ActivityLog } from '@/core/db/types';
import { useRepository } from '@/hooks/useRepository';
import { toDateKey, dateLabel } from '@/lib/date';

/** RN port of apps/web-react/src/features/activity/useActivityLog.ts — pure hook/logic, no platform
 *  work needed (`useRepository`/`@/lib/date` are already platform-agnostic). */

export interface ActivityDay {
  label: string;
  items: ActivityLog[];
}

/** Group a (already sorted, newest-first) entry list by day for the feed. */
export function groupByDay(entries: ActivityLog[]): ActivityDay[] {
  const byDay = new Map<string, ActivityLog[]>();
  for (const e of entries) {
    const key = toDateKey(e.timestamp);
    const arr = byDay.get(key);
    if (arr) arr.push(e);
    else byDay.set(key, [e]);
  }
  return Array.from(byDay.entries()).map(([key, list]) => ({ label: dateLabel(key), items: list }));
}

/** Loads the activity log and derives the reverse-chronological feed, day grouping, and the restore bin. */
export function useActivityLog() {
  const { items, loading, reload } = useRepository(activityLogRepo);

  // Found in manual testing (2026-08-14) — a CSV import's `IMPORT` entry never appeared in an
  // already-mounted Timeline until the screen was fully unmounted and remounted (so Undo, only reachable
  // from that entry, wasn't reachable either). Root cause: `useRepository` only ever loads once at mount
  // (or on an explicit `reload` this hook itself calls, e.g. after `restore`/`undo`) — it has no live
  // subscription of its own, so a write made through a SEPARATE `activityLogRepo` instance
  // (`logActivityAwaited`, called directly by `useImport.ts`'s `commitAndImport()`) never reaches an
  // already-mounted Timeline. `Timeline` is a pushed `HomeStack` screen (not a tab root), so it stays
  // mounted across a tab switch (this app's persistent-chrome architecture) — exactly the scenario that
  // exposes this: open Timeline, switch to Expenses, run a CSV import, switch back to Home → the SAME
  // still-mounted Timeline instance, now showing stale data.
  //
  // `subscribeActivity` (`packages/core/src/core/db/activityLog.ts`) is the purpose-built fix for exactly
  // this — a synchronous "an activity was just logged" signal, fired by every `logActivity`/
  // `logActivityAwaited` call regardless of which repo instance made it. Deliberately NOT `useTxnRefresh`
  // (the pattern `useExpenses.ts`/`useAccounts.ts`/`CheckpointTimelinePage.tsx` use for their own "another
  // repo instance wrote a transaction elsewhere" refresh): that signal only fires for transaction writes
  // specifically (`notifyTxnChanged()`), so Timeline would still miss a non-transaction activity entry
  // logged elsewhere while already mounted (e.g. a bulk category merge, a CHECKPOINT set from a different
  // screen) — `subscribeActivity` is the broader, exact-match signal for "this is an activity-log feed,"
  // and until now had exactly one consumer (`backupEngine.ts`'s Track D change-signal), not this screen.
  useEffect(() => subscribeActivity(() => reload()), [reload]);

  const entries = useMemo(() => [...items].sort((a, b) => b.timestamp - a.timestamp), [items]);

  const grouped = useMemo<ActivityDay[]>(() => groupByDay(entries), [entries]);

  // UNDO_IMPORT included alongside DELETE/BULK_DELETE (2026-08-06) — undoing an import IS a bulk delete
  // of expenses under the hood (see importWriter.ts's header comment), so a not-yet-restored UNDO_IMPORT
  // entry belongs in the same "things you can bring back" bin as any other deletion.
  const recentlyDeleted = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.snapshot &&
          !e.restored &&
          (e.action === 'DELETE' || e.action === 'BULK_DELETE' || e.action === 'UNDO_IMPORT')
      ),
    [entries]
  );

  const restore = useCallback(
    async (id: string, entry?: ActivityLog) => {
      // UNDO_IMPORT needs the extra relatedLogId-based flip-back (restoreUndoneImport) so the original
      // IMPORT entry's own Undo button correctly reappears — every other action reuses the plain,
      // generic restoreActivity(). `entry` is optional only so existing (non-import) call sites that
      // never pass it keep working unchanged.
      if (entry?.action === 'UNDO_IMPORT') await restoreUndoneImport(id);
      else await restoreActivity(id);
      reload();
    },
    [reload]
  );

  /** Reverses a whole import batch (deletes every expense id in the entry's snapshot) — the durable
   *  fallback for the immediate post-import "Undo" button (`useImport.ts`'s `undoImport()`/
   *  `useBankImport.ts`'s commit path), reachable from the Timeline any time after the fact. Returns
   *  how many transactions were deleted (0 if the entry is missing/already undone/not an IMPORT entry). */
  const undo = useCallback(
    async (id: string) => {
      const count = await undoImportBatch(id);
      reload();
      return count;
    },
    [reload]
  );

  return { entries, grouped, recentlyDeleted, loading, reload, restore, undo };
}
