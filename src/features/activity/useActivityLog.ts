import { useCallback, useMemo } from 'react';
import { activityLogRepo } from '@/core/db/repositories';
import { restoreActivity } from '@/core/db/activityLog';
import type { ActivityLog } from '@/core/db/types';
import { useRepository } from '@/hooks/useRepository';
import { toDateKey, dateLabel } from '@/lib/date';

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

  const entries = useMemo(() => [...items].sort((a, b) => b.timestamp - a.timestamp), [items]);

  const grouped = useMemo<ActivityDay[]>(() => groupByDay(entries), [entries]);

  const recentlyDeleted = useMemo(
    () => entries.filter((e) => e.snapshot && !e.restored && (e.action === 'DELETE' || e.action === 'BULK_DELETE')),
    [entries]
  );

  const restore = useCallback(
    async (id: string) => {
      await restoreActivity(id);
      reload();
    },
    [reload]
  );

  return { entries, grouped, recentlyDeleted, loading, reload, restore };
}
