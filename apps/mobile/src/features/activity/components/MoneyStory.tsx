import { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ActivityLog } from '@/core/db/types';
import { ChipAvatar } from '~/components/ui/ChipAvatar';
import { Icon } from '~/components/Icon';
import { narrateDay, weeklyStats } from '@/core/activity/narrate';
import { TrackingHeatmap } from './TrackingHeatmap';
import { OnThisDay } from './OnThisDay';
import { MilestoneBanner } from './MilestoneBanner';
import { WrappedModal } from './WrappedModal';

interface Props {
  entries: ActivityLog[];
  masked: boolean;
}

interface Tile {
  value: string;
  label: string;
}

/**
 * RN port of apps/web-legacy/src/features/activity/components/MoneyStory.tsx — Story tab: Chip
 * narration + a compact 2×2 week grid + streak heatmap + On this day. `grid-cols-2` → `flex-row
 * flex-wrap`, established Track 4 pattern.
 */
export function MoneyStory({ entries, masked }: Props) {
  const story = useMemo(() => narrateDay(entries), [entries]);
  const week = useMemo(() => weeklyStats(entries), [entries]);
  const [showWrapped, setShowWrapped] = useState(false);
  const isSunday = new Date().getDay() === 0;

  const tiles: Tile[] = week
    ? [
        { value: String(week.total), label: 'changes' },
        { value: week.busiestDay ?? '—', label: 'busiest day' },
        { value: String(week.added), label: 'added' },
        { value: String(week.removed), label: 'removed' }
      ]
    : [];

  return (
    <View className="px-4 pt-4 gap-5">
      <MilestoneBanner entries={entries} />

      {/* Chip narration */}
      <View className="flex-row gap-2.5">
        <View className="flex-shrink-0 mt-0.5">
          <ChipAvatar size={32} />
        </View>
        <View className="bg-surface rounded-2xl px-3.5 py-2.5 flex-1" style={{ borderTopLeftRadius: 4 }}>
          <Text className="text-sm text-primary leading-relaxed">{story}</Text>
        </View>
      </View>

      {/* Weekly Wrapped entry — emphasised on Sundays. Web's `linear-gradient(135deg,#00C47D,#007A4D)`
          was flattened to a single flat color here — found via the 2026-07-25 parity sweep — restored
          via `expo-linear-gradient` (already a dependency, see Stories' own gradient cards). */}
      {week && (
        <Pressable onPress={() => setShowWrapped(true)}>
          <LinearGradient
            colors={['#00C47D', '#007A4D']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 }}
            className="flex-row items-center gap-3"
          >
            <Icon name="ti-sparkles" size={20} color="#ffffff" />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-white">
                {isSunday ? 'Your week is ready 🎉' : 'Your week, wrapped'}
              </Text>
              <Text className="text-[11px] text-white" style={{ opacity: 0.9 }}>
                Tap through your week · share it
              </Text>
            </View>
            <Icon name="ti-chevron-right" size={18} color="#ffffff" />
          </LinearGradient>
        </Pressable>
      )}

      {/* This week — 2×2 grid */}
      {tiles.length > 0 && (
        <View>
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mb-2">This week</Text>
          <View className="flex-row flex-wrap gap-2">
            {tiles.map((t) => (
              <View key={t.label} className="bg-surface rounded-xl px-3 py-2.5" style={{ width: '48%' }}>
                <Text className="text-xl font-bold text-primary leading-none">{t.value}</Text>
                <Text className="text-[11px] text-secondary mt-1">{t.label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <TrackingHeatmap entries={entries} />
      <OnThisDay entries={entries} masked={masked} />

      {showWrapped && <WrappedModal entries={entries} onClose={() => setShowWrapped(false)} />}
    </View>
  );
}
