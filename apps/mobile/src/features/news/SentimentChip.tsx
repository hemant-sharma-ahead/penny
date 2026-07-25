import { View, Text } from 'react-native';
import type { SentimentLabel } from '@/core/sentiment';
import { tint, ink } from '~/lib/color';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

const META: Record<SentimentLabel, { color: string; icon: string; text: string }> = {
  positive: { color: '#10b981', icon: 'ti-trending-up', text: 'Positive' },
  negative: { color: '#ef4444', icon: 'ti-trending-down', text: 'Negative' },
  neutral: { color: '#94a3b8', icon: 'ti-minus', text: 'Neutral' }
};

/**
 * RN port of apps/web-legacy/src/features/news/SentimentChip.tsx. Small pill showing a headline's
 * news-tone (positive/negative/neutral). Descriptive only — NOT a buy/sell signal or price prediction.
 */
export function SentimentChip({ label }: { label: SentimentLabel }) {
  const theme = useThemeColors();
  const m = META[label];
  return (
    <View className="flex-row items-center gap-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: tint(m.color) }}>
      <Icon name={m.icon} size={11} color={ink(m.color, theme.textPrimary)} />
      <Text className="text-[10px] font-semibold" style={{ color: ink(m.color, theme.textPrimary) }}>
        {m.text}
      </Text>
    </View>
  );
}
