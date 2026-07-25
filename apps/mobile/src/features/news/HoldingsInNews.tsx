import { View, Text, Pressable, Linking } from 'react-native';
import type { ScoredHeadline, SentimentLabel } from '@/core/sentiment';
import { Icon } from '~/components/Icon';
import type { HoldingNewsMatch } from './useHoldingsInNews';

function relativeTime(epochMs: number): string {
  const mins = Math.floor((Date.now() - epochMs) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TONE: Record<SentimentLabel, { color: string; icon: string; text: string }> = {
  positive: { color: '#10b981', icon: 'ti-trending-up', text: 'Positive' },
  negative: { color: '#ef4444', icon: 'ti-trending-down', text: 'Negative' },
  neutral: { color: '#94a3b8', icon: 'ti-minus', text: 'Neutral' }
};

interface Props {
  matches: HoldingNewsMatch[];
  scoredById: Map<string, ScoredHeadline>;
}

/**
 * RN port of apps/web-legacy/src/features/news/HoldingsInNews.tsx. "Holdings News" tab content —
 * headlines mentioning stocks the user owns, recency-ordered, each with the headline's own sentiment
 * tone. Informational (news about what you own), NOT a trade idea or ranking of picks. Web's
 * `<a target="_blank">` becomes `Linking.openURL`.
 */
export function HoldingsInNews({ matches, scoredById }: Props) {
  if (matches.length === 0) {
    return (
      <View className="bg-surface rounded-2xl p-4 flex-row items-center gap-3">
        <Icon name="ti-mood-neutral" size={20} color="#94a3b8" />
        <View className="flex-1">
          <Text className="text-sm text-secondary">None of your holdings are in today's news.</Text>
          <Text className="text-[11px] text-tertiary mt-0.5">
            We'll surface headlines here when they mention a stock you own.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <View className="gap-2">
        {matches.map(({ item, holdings }) => {
          const tone = TONE[scoredById.get(item.id)?.label ?? 'neutral'];
          return (
            <Pressable
              key={item.id}
              onPress={() => void Linking.openURL(item.link)}
              className="bg-surface rounded-2xl p-3 gap-1.5 active:opacity-70"
            >
              <View className="flex-row items-center justify-between gap-2">
                <View className="flex-row items-center gap-1.5 flex-wrap flex-1">
                  {holdings.map((h) => (
                    <Text
                      key={h.symbol}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-2 text-secondary"
                    >
                      {h.symbol}
                    </Text>
                  ))}
                </View>
                <View className="flex-row items-center gap-1">
                  <Icon name={tone.icon} size={12} color={tone.color} />
                  <Text className="text-[10px] font-medium" style={{ color: tone.color }}>
                    {tone.text}
                  </Text>
                  <Text className="text-[10px] text-tertiary">· {relativeTime(item.publishedAt)}</Text>
                </View>
              </View>
              <Text className="text-sm font-medium text-primary leading-snug" numberOfLines={2}>
                {item.title}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text className="text-[10px] text-tertiary leading-tight mt-2">
        News mentioning stocks you own — informational only, not investment advice or a recommendation.
      </Text>
    </>
  );
}
