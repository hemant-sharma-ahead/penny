import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { useToast } from '~/context/ToastContext';
import { useProfile } from '@/hooks/useProfile';
import { formatCompact } from '@/lib/formatters';
import { createGoalFromTemplate } from '@/core/advisor/guidance';
import { lifeStageGoalTemplates } from '@/core/advisor/lifeStageGoals';
import type { Goal } from '@/core/db/types';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';

/**
 * "Suggested for you" — life-stage goal templates from the opt-in profile (education corpus, home
 * down-payment, retirement…). One tap adds a `source:'suggested'` goal. Deduped against existing goals;
 * hidden when nothing new to suggest. Powered on-device by the profile — advice only.
 */
export function SuggestedGoals({ goals }: { goals: Goal[] }) {
  const theme = useThemeColors();
  const { profile } = useProfile();
  const { showToast } = useToast();
  const [adding, setAdding] = useState<string | null>(null);

  const existing = new Set(goals.map((g) => g.name.trim().toLowerCase()));
  const templates = lifeStageGoalTemplates(profile).filter((t) => !existing.has(t.name.trim().toLowerCase()));
  if (templates.length === 0) return null;

  async function add(name: string) {
    const t = templates.find((x) => x.name === name);
    if (!t || adding) return;
    setAdding(name);
    try {
      await createGoalFromTemplate(t);
      showToast({ message: `Added "${t.name}" to your goals` });
    } finally {
      setAdding(null);
    }
  }

  return (
    <View className="rounded-2xl bg-surface border border-theme p-3 mb-1">
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-tertiary px-1 mb-1">
        Suggested for you
      </Text>
      {templates.map((t, i) => (
        <View key={t.name} className={`flex-row items-center gap-3 py-2.5 ${i > 0 ? 'border-t border-theme' : ''}`}>
          <View
            className="w-8 h-8 rounded-lg items-center justify-center"
            style={{ backgroundColor: tint(theme.primary) }}
          >
            <Icon name={t.icon ?? 'ti-target'} size={16} color={theme.primary} />
          </View>
          <View className="flex-1">
            <Text className="text-[13px] font-semibold text-primary" numberOfLines={1}>
              {t.name}
            </Text>
            <Text className="text-[11px] text-tertiary">Target ~{formatCompact(t.targetAmount)}</Text>
          </View>
          <Pressable
            onPress={() => void add(t.name)}
            disabled={adding !== null}
            className="rounded-full px-3 py-1.5"
            style={{ backgroundColor: theme.primary, opacity: adding !== null ? 0.5 : 1 }}
          >
            <Text className="text-[11px] font-bold text-white">{adding === t.name ? 'Adding…' : 'Add'}</Text>
          </Pressable>
        </View>
      ))}
      <Text className="text-[10px] text-tertiary px-1 mt-1.5">
        Based on your profile · edit amounts & dates anytime.
      </Text>
    </View>
  );
}
