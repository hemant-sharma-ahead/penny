import { useMemo } from 'react';
import { View, Text } from 'react-native';
import type { ActivityLog } from '@/core/db/types';
import { DAY_MS, startOfToday, toDateKey } from '@/lib/date';
import { useThemeColors } from '~/theme/useThemeColors';

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
  let current = 0;
  for (let d = today; daysWithActivity.has(toDateKey(d)); d -= DAY_MS) current++;
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

/**
 * RN port of apps/web-legacy/src/features/activity/components/TrackingHeatmap.tsx. Web lays this out
 * with CSS Grid's `grid-auto-flow: column` (7 rows × N columns, filled column-by-column) — no direct RN
 * Yoga equivalent (same CSS-Grid-to-Flexbox gap this migration has hit repeatedly), so this pre-chunks
 * the flat day list into `weeks` column-arrays of 7 and renders each as its own `flex-col`, wrapped in a
 * `flex-row` — same visual result as the web grid.
 */
export function TrackingHeatmap({ entries, weeks = 14 }: Props) {
  const theme = useThemeColors();
  const { columns, current, longest } = useMemo(() => {
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
    const cols: (typeof days)[] = [];
    for (let i = 0; i < days.length; i += 7) cols.push(days.slice(i, i + 7));
    return { columns: cols, ...computeStreaks(new Set(counts.keys())) };
  }, [entries, weeks]);

  return (
    <View className="rounded-2xl bg-surface p-4">
      <View className="flex-row items-baseline justify-between mb-3">
        <Text className="text-sm font-semibold text-primary">Tracking streak</Text>
        <Text className="text-xs text-secondary">
          <Text className="font-semibold text-primary">{current}</Text> day{current === 1 ? '' : 's'} · best {longest}
        </Text>
      </View>
      <View className="flex-row gap-[3px]">
        {columns.map((col, ci) => (
          <View key={ci} className="flex-1 gap-[3px]">
            {col.map((c) => {
              const level = levelFor(c.count);
              return (
                <View
                  key={c.key}
                  className="aspect-square rounded-[3px]"
                  style={{
                    backgroundColor: level === 0 ? theme.surfaceSecondary : theme.primary,
                    opacity: level === 0 ? 1 : LEVEL_OPACITY[level]
                  }}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
