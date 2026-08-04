import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import type { MoodSummary } from '@/core/sentiment';
import { NEWS_SOURCES } from '@/core/news/newsClient';
import { Icon } from '~/components/Icon';
import { tint, ink } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';

const SOURCES_LABEL = NEWS_SOURCES.map((s) => s.label).join(' · ');

/**
 * Collapsible "today's news mood" note — same visual language as `AssetTaxNote` (tinted
 * background/border by color, icon + one-liner + chevron, expands in place). Sits as the first item
 * of the scrolling news list (not fixed chrome), so it costs no permanent vertical space once
 * collapsed or scrolled past — replaces the old always-visible `NewsMoodGauge` banner.
 */
export function NewsMoodNote({ mood }: { mood: MoodSummary }) {
  const theme = useThemeColors();
  const [open, setOpen] = useState(false);

  const SKEW_META: Record<MoodSummary['skew'], { color: string; icon: string }> = {
    positive: { color: theme.success, icon: 'ti-trending-up' },
    negative: { color: theme.danger, icon: 'ti-trending-down' },
    mixed: { color: theme.warning, icon: 'ti-arrows-up-down' },
    quiet: { color: theme.neutral, icon: 'ti-minus' }
  };
  const { color, icon } = SKEW_META[mood.skew];
  const inkColor = ink(color, theme.textPrimary);
  const { positive, negative, neutral, total } = mood;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <View className="rounded-xl border mb-3" style={{ backgroundColor: tint(color, 10), borderColor: tint(color, 25) }}>
      <Pressable onPress={() => setOpen((v) => !v)} className="w-full flex-row items-center gap-2 p-2.5">
        <Icon name={icon} size={16} color={color} />
        <Text className="text-xs font-semibold flex-1" style={{ color: inkColor }} numberOfLines={1}>
          {mood.label}
          {total > 0 ? ` · ${total} headlines` : ''}
        </Text>
        <Icon name={open ? 'ti-chevron-up' : 'ti-chevron-down'} size={16} color={color} />
      </Pressable>
      {open && (
        <View className="px-3 pb-3 pt-0.5 gap-2.5">
          {total > 0 && (
            <View className="flex-row h-1.5 rounded-full overflow-hidden">
              <View style={{ width: `${pct(positive)}%`, backgroundColor: theme.success }} />
              <View style={{ width: `${pct(neutral)}%`, backgroundColor: theme.neutral }} />
              <View style={{ width: `${pct(negative)}%`, backgroundColor: theme.danger }} />
            </View>
          )}
          <View className="gap-1.5">
            {total > 0 && (
              <View className="flex-row gap-2">
                <Icon name="ti-point-filled" size={11} color={color} />
                <Text className="text-[11px] leading-relaxed flex-1" style={{ color: inkColor }}>
                  {positive} positive · {neutral} neutral · {negative} negative headlines today
                </Text>
              </View>
            )}
            <View className="flex-row gap-2">
              <Icon name="ti-point-filled" size={11} color={color} />
              <Text className="text-[11px] leading-relaxed flex-1" style={{ color: inkColor }}>
                Sources: {SOURCES_LABEL}
              </Text>
            </View>
          </View>
          <Text className="text-[10px] leading-relaxed" style={{ color: theme.textTertiary }}>
            Informational only — a summary of news tone, not investment advice or a market prediction.
          </Text>
        </View>
      )}
    </View>
  );
}
