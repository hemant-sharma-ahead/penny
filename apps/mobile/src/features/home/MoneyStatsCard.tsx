import { View, Text, Pressable } from 'react-native';
import { formatCompact, formatCurrency } from '@/lib/formatters';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useHomeStats } from './useHomeStats';

/**
 * The Home "money facts" card (Track: Home advisor) — one card, three hairline-split columns:
 * Spent this month (living subtext) · Insurance cover · Loans outstanding. Each column taps through.
 * No real nav stack yet — every tap is a no-op until Home is wired into real navigation (same as
 * every other cross-module link in this port).
 */
export function MoneyStatsCard() {
  const stats = useHomeStats();
  const theme = useThemeColors();
  if (!stats) return null;

  const cols: { key: string; icon: string; color: string; label: string; value: string; sub: string }[] = [
    {
      key: 'spent',
      icon: 'ti-receipt',
      color: theme.danger,
      label: 'Spent',
      value: formatCurrency(stats.spentThisMonth),
      sub: `Living ${formatCompact(stats.livingThisMonth)}`
    },
    {
      key: 'insurance',
      icon: 'ti-shield',
      color: theme.info,
      label: 'Insurance',
      value: stats.insuranceCover > 0 ? formatCompact(stats.insuranceCover) : '—',
      sub: 'cover'
    },
    {
      key: 'loans',
      icon: 'ti-building-bank',
      color: '#06b6d4',
      label: 'Loans',
      value: stats.loansOutstanding > 0 ? formatCompact(stats.loansOutstanding) : '—',
      sub: 'outstanding'
    }
  ];

  return (
    <View className="bg-surface border border-theme rounded-2xl mb-4 overflow-hidden">
      <View className="flex-row">
        {cols.map((c, i) => (
          <Pressable
            key={c.key}
            onPress={() => {}}
            className={`flex-1 px-3 py-3 ${i > 0 ? 'border-l border-theme' : ''}`}
          >
            <View className="flex-row items-center gap-1.5">
              <Icon name={c.icon} size={12} color={c.color} />
              <Text className="text-[10px] font-semibold text-secondary">{c.label}</Text>
            </View>
            <Text className="text-[15px] font-extrabold text-primary tracking-tight mt-1">{c.value}</Text>
            <Text className="text-[9px] text-tertiary mt-0.5">{c.sub}</Text>
          </Pressable>
        ))}
      </View>

      {/* Tax — a line into the Tax Awareness screen (Tax has no Home tile of its own). */}
      <Pressable
        onPress={() => {}}
        className="w-full flex-row items-center gap-2 px-3 py-2.5 border-t border-theme active:bg-surface-2"
      >
        <Icon name="ti-receipt-tax" size={14} color="#8b5cf6" />
        <Text className="text-[12px] font-semibold text-primary">Tax story</Text>
        <Text className="text-[11px] text-tertiary flex-1" numberOfLines={1}>
          · where your money really goes this FY
        </Text>
        <Icon name="ti-chevron-right" size={15} color={theme.textTertiary} />
      </Pressable>
    </View>
  );
}
