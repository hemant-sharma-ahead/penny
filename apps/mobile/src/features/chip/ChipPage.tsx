import { useEffect, useState } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { chipInsightsRepo } from '@/core/db/repositories';
import { DEFAULT_INSIGHTS } from '@/core/ai-safety/mockChip';
import type { ChipInsight } from '@/core/db/types';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useRegisterHeaderScreen } from '~/navigation/HeaderBackContext';

async function seedInsightsIfEmpty(): Promise<ChipInsight[]> {
  const existing = await chipInsightsRepo.getAll();
  if (existing.length > 0) return existing;
  const now = Date.now();
  const seeded: ChipInsight[] = DEFAULT_INSIGHTS.map((s) => ({
    ...s,
    isRead: false,
    isMock: true,
    generatedAt: now,
    createdAt: now
  }));
  await Promise.all(seeded.map((i) => chipInsightsRepo.put(i)));
  return seeded;
}

/**
 * RN port of apps/web-react/src/features/chip/ChipPage.tsx — the rule-based "insights" dashboard
 * (headline/reasoning/consequence cards seeded from `mockChip`'s `DEFAULT_INSIGHTS`), not a real LLM
 * chat — same as web today. Real conversational Chip (Anthropic-backed) stays Phase 2 on both
 * platforms; this screen was the one web-react feature folder mobile had never ported at all.
 */
export function ChipPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  useRegisterHeaderScreen('Chip');
  const [insights, setInsights] = useState<ChipInsight[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    seedInsightsIfEmpty()
      .then((all) => {
        if (cancelled) return;
        setInsights(all.filter((x) => !x.isRead));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  function dismissInsight(insight: ChipInsight) {
    chipInsightsRepo
      .put({ ...insight, isRead: true })
      .then(() => setInsights((prev) => prev.filter((i) => i.id !== insight.id)))
      .catch(() => {});
  }

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 16 }}>
        {loaded && insights.length === 0 && (
          <Card className="items-center">
            <Icon name="ti-sparkles" size={36} color={theme.textTertiary} />
            <Text className="text-sm font-medium text-primary mt-3">No new insights</Text>
            <Text className="text-xs text-secondary mt-1 text-center">
              Add your financial data and Chip will surface insights here.
            </Text>
          </Card>
        )}

        {insights.length > 0 && (
          <View>
            <Text className="text-xs font-medium text-tertiary mb-2">Insights</Text>
            <View className="gap-2">
              {insights.map((insight) => (
                <Card key={insight.id} radius="md" padding="sm">
                  <Text className="text-[10px] font-medium uppercase tracking-wide text-tertiary">
                    {insight.moduleTag}
                  </Text>
                  <Text className="text-sm font-medium mt-0.5 mb-1 text-primary">{insight.headline}</Text>
                  <Text className="text-xs leading-relaxed text-secondary">{insight.reasoning}</Text>
                  {insight.consequence && (
                    <Text className="text-xs mt-1.5 leading-relaxed" style={{ color: theme.warning }}>
                      ⚠ {insight.consequence}
                    </Text>
                  )}
                  {insight.actionLabel && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 self-start px-0"
                      textColor={theme.primary}
                      onPress={() => dismissInsight(insight)}
                    >
                      {insight.actionLabel} →
                    </Button>
                  )}
                </Card>
              ))}
            </View>
          </View>
        )}

        <Card className="items-center">
          <Icon name="ti-message-chatbot" size={36} color={theme.textTertiary} />
          <Text className="text-sm font-medium text-primary mt-3">Chip AI chat coming in Phase 2</Text>
          <Text className="text-xs text-secondary mt-1 text-center">
            Full conversational advisor powered by Claude.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
