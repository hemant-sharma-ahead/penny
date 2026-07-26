import { View, Text } from 'react-native';
import type { SentimentLabel } from '@/core/sentiment';
import { tint, ink } from '~/lib/color';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

/**
 * RN port of apps/web-legacy/src/features/news/SentimentChip.tsx. Small pill showing a headline's
 * news-tone (positive/negative/neutral). Descriptive only — NOT a buy/sell signal or price prediction.
 * Colors now read from `theme.success`/`theme.danger`/`theme.neutral` — web's own `STATUS.success`/
 * `STATUS.danger`/`STATUS.neutral` theme-token references, previously hardcoded to unrelated hex
 * literals here (`#10b981`/`#ef4444`/`#94a3b8`), the same "literal CSS-var-string" bug class already
 * fixed elsewhere in the app (see CLAUDE.md's Track 4 progress notes) — found via the 2026-07-25 parity
 * sweep, which flagged the wrong "neutral" hex specifically.
 */
export function SentimentChip({ label }: { label: SentimentLabel }) {
  const theme = useThemeColors();
  const META: Record<SentimentLabel, { color: string; icon: string; text: string }> = {
    positive: { color: theme.success, icon: 'ti-trending-up', text: 'Positive' },
    negative: { color: theme.danger, icon: 'ti-trending-down', text: 'Negative' },
    neutral: { color: theme.neutral, icon: 'ti-minus', text: 'Neutral' }
  };
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
