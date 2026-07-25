import { View, Text } from 'react-native';
import type { MoodSummary } from '@/core/sentiment';
import { tint } from '~/lib/color';
import { Icon } from '~/components/Icon';

const SKEW_META: Record<MoodSummary['skew'], { color: string; icon: string }> = {
  positive: { color: '#10b981', icon: 'ti-trending-up' },
  negative: { color: '#ef4444', icon: 'ti-trending-down' },
  mixed: { color: '#f59e0b', icon: 'ti-arrows-up-down' },
  quiet: { color: '#94a3b8', icon: 'ti-minus' }
};

/**
 * RN port of apps/web-legacy/src/features/news/NewsMoodGauge.tsx. "Today's news mood" — a full-bleed
 * banner fixed under the page header (not part of the scrolling feed). Descriptive only — how the
 * current headlines skew (positive/negative/mixed) — NOT a market forecast or investment advice. The
 * disclaimer below is mandatory and must stay persistent (not hidden behind a tap).
 */
export function NewsMoodGauge({ mood }: { mood: MoodSummary }) {
  const { color, icon } = SKEW_META[mood.skew];
  const { positive, negative, neutral, total } = mood;

  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <View>
      <View
        className="flex-row items-center gap-3 px-4 py-2.5 border-b"
        style={{ backgroundColor: tint(color, 10), borderColor: tint(color, 25) }}
      >
        <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: tint(color, 20) }}>
          <Icon name={icon} size={18} color={color} />
        </View>

        <View className="flex-1">
          <Text className="text-sm font-bold" style={{ color }} numberOfLines={1}>
            {mood.label}
          </Text>
          {total > 0 && (
            <Text className="text-[10px] text-secondary mt-0.5">
              {positive} pos · {neutral} neutral · {negative} neg
            </Text>
          )}
        </View>

        {total > 0 && (
          <View className="flex-row h-1.5 w-11 rounded-full overflow-hidden">
            <View style={{ width: `${pct(positive)}%`, backgroundColor: '#10b981' }} />
            <View style={{ width: `${pct(neutral)}%`, backgroundColor: '#94a3b8' }} />
            <View style={{ width: `${pct(negative)}%`, backgroundColor: '#ef4444' }} />
          </View>
        )}

        <View className="items-end">
          <Text className="text-base font-extrabold text-primary" numberOfLines={1}>
            {total}
          </Text>
          <Text className="text-[8.5px] text-tertiary">headlines</Text>
        </View>
      </View>

      <Text className="text-[9px] text-tertiary px-4 py-1 border-b border-theme">
        Informational only — a summary of news tone, not investment advice or a market prediction.
      </Text>
    </View>
  );
}
