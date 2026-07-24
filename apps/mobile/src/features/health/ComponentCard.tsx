import { View, Text } from 'react-native';
import { ProgressBar } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import type { ComponentStatus, ScoreComponent } from '@/core/health/scorer';

export function ComponentCard({ c }: { c: ScoreComponent }) {
  const theme = useThemeColors();
  const STATUS_STYLE: Record<ComponentStatus, { border: string; text: string; bar: string }> = {
    excellent: { border: theme.success, text: theme.success, bar: theme.success },
    good: { border: theme.success, text: theme.success, bar: theme.success },
    fair: { border: theme.warning, text: theme.warning, bar: theme.warning },
    poor: { border: theme.danger, text: theme.danger, bar: theme.danger },
    no_data: { border: theme.border, text: theme.textTertiary, bar: theme.borderStrong }
  };
  const s = STATUS_STYLE[c.status];
  const pct = c.max > 0 ? (c.earned / c.max) * 100 : 0;
  const statusLabel = c.status === 'no_data' ? 'No data' : c.status.charAt(0).toUpperCase() + c.status.slice(1);

  return (
    <View className="bg-surface rounded-2xl p-3 gap-2 border" style={{ borderColor: s.border }}>
      <View className="flex-row items-center justify-between gap-1">
        <View className="flex-row items-center gap-1.5 flex-1 min-w-0">
          <Icon name={c.icon} size={15} color={s.text} />
          <Text className="text-xs font-semibold text-primary flex-shrink" numberOfLines={1}>
            {c.label}
          </Text>
        </View>
        <Text className="text-[10px] font-semibold flex-shrink-0" style={{ color: s.text }}>
          {c.earned}/{c.max}
        </Text>
      </View>

      <ProgressBar value={pct} color={s.bar} />

      <View>
        <Text
          className="text-[9px] font-semibold uppercase tracking-wide self-start px-1.5 py-0.5 rounded"
          style={{ color: s.text, backgroundColor: tint(s.bar) }}
        >
          {statusLabel}
        </Text>
        <Text className="text-[10px] mt-1 leading-relaxed text-secondary" numberOfLines={2}>
          {c.insight}
        </Text>
      </View>
    </View>
  );
}
