import { useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import type { ActivityLog } from '@/core/db/types';
import { detectMilestone } from '@/core/activity/milestones';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { getItem, setItem } from '~/lib/storage';
import { Confetti } from './Confetti';
import { tint } from '~/lib/color';

interface Props {
  entries: ActivityLog[];
}

const SEEN_KEY = 'penny_milestone_seen';

/**
 * RN port of apps/web-react/src/features/activity/components/MilestoneBanner.tsx. Web reads/writes the
 * "seen" flag via synchronous `localStorage`; here via `~/lib/storage`'s async `getItem`/`setItem` (same
 * AsyncStorage-hydration convention used throughout this migration) — the celebrate check runs once the
 * async read resolves rather than synchronously on mount.
 */
export function MilestoneBanner({ entries }: Props) {
  const theme = useThemeColors();
  const milestone = useMemo(() => detectMilestone(entries), [entries]);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (!milestone) return;
    let cancelled = false;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    void getItem(SEEN_KEY).then((seen) => {
      if (cancelled || seen === milestone.key) return;
      void setItem(SEEN_KEY, milestone.key);
      setCelebrate(true);
      hideTimer = setTimeout(() => !cancelled && setCelebrate(false), 2400);
    });
    return () => {
      cancelled = true;
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [milestone]);

  if (!milestone) return null;

  return (
    <View
      className="relative overflow-hidden rounded-2xl px-4 py-3 flex-row items-center gap-3"
      style={{ backgroundColor: tint(theme.primary, 12) }}
    >
      {celebrate && <Confetti />}
      <View
        className="w-9 h-9 rounded-xl items-center justify-center flex-shrink-0"
        style={{ backgroundColor: theme.primary }}
      >
        <Icon name={milestone.icon} size={18} color="#fff" />
      </View>
      <View>
        <Text className="text-sm font-semibold text-primary">{milestone.label}</Text>
        <Text className="text-[11px] text-secondary">A little milestone worth celebrating.</Text>
      </View>
    </View>
  );
}
