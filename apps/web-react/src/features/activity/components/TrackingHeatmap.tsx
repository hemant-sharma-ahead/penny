import { useMemo } from 'react';
import type { ActivityLog } from '@/core/db/types';
import { DAY_MS, startOfToday, toDateKey } from '@/lib/date';

interface Props {
  entries: ActivityLog[];
  weeks?: number;
}

function levelFor(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

const LEVEL_OPACITY = [0, 0.25, 0.5, 0.75, 1];

function computeStreaks(daysWithActivity: Set<string>): { current: number; longest: number } {
  const today = startOfToday();
  // current: consecutive days with activity ending today (0 if nothing logged today)
  let current = 0;
  for (let d = today; daysWithActivity.has(toDateKey(d)); d -= DAY_MS) current++;
  // longest: scan all active days
  const sorted = [...daysWithActivity].sort();
  let longest = 0;
  let run = 0;
  let prevKey = '';
  for (const key of sorted) {
    if (prevKey && toDateKey(new Date(prevKey).getTime() + DAY_MS) === key) run++;
    else run = 1;
    longest = Math.max(longest, run);
    prevKey = key;
  }
  return { current, longest };
}

/** GitHub-style heatmap of tracking activity + current/longest streak. */
export function TrackingHeatmap({ entries, weeks = 14 }: Props) {
  const { cells, current, longest } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const key = toDateKey(e.timestamp);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const total = weeks * 7;
    const today = startOfToday();
    const start = today - (total - 1) * DAY_MS;
    const days = Array.from({ length: total }, (_, i) => {
      const key = toDateKey(start + i * DAY_MS);
      return { key, count: counts.get(key) ?? 0 };
    });
    return { cells: days, ...computeStreaks(new Set(counts.keys())) };
  }, [entries, weeks]);

  return (
    <div className="surface rounded-2xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-sm font-semibold text-primary">Tracking streak</p>
        <p className="text-xs text-secondary">
          <span className="font-semibold text-primary">{current}</span> day{current === 1 ? '' : 's'} · best {longest}
        </p>
      </div>
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateRows: 'repeat(7, 1fr)', gridAutoFlow: 'column', gridAutoColumns: '1fr' }}
      >
        {cells.map((c) => {
          const level = levelFor(c.count);
          return (
            <div
              key={c.key}
              className="aspect-square rounded-[3px]"
              title={`${c.key}: ${c.count} change${c.count === 1 ? '' : 's'}`}
              style={
                level === 0
                  ? { backgroundColor: 'var(--color-surface-secondary)' }
                  : { backgroundColor: 'var(--color-primary)', opacity: LEVEL_OPACITY[level] }
              }
            />
          );
        })}
      </div>
    </div>
  );
}
