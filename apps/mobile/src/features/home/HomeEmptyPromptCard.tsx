import { View, Pressable, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';

interface PromptAction {
  label: string;
  onPress: () => void;
  /** Defaults to 'primary'. A card with two actions uses one of each — the more likely next step first. */
  variant?: 'primary' | 'secondary';
}

interface Props {
  icon: string;
  title: string;
  subtitle: string;
  actions: PromptAction[];
  /** Half-width, side-by-side layout (2026-08-10) — used when two independent prompts (Insurance, Loans)
   *  need showing at once, so they share one row instead of stacking full-width. Smaller icon tile/type
   *  scale and a 2-line subtitle clamp to fit the narrower card; the bottom margin moves to the row
   *  wrapper itself (`MoneyStatsCard.tsx`) since two side-by-side cards share one margin, not one each.
   *  `flex-1` here means a single compact card with no sibling still fills the whole row on its own —
   *  no separate "alone" layout needed. */
  compact?: boolean;
}

/**
 * Shared "nothing here yet" card for Home's widgets (net worth, spend/insurance/loans) —
 * `docs/mockups/proposals/home-empty-states-v2.html`. Same visual language across all of them: an
 * icon tile, a title stating plainly what's missing, a one-line explanation, and one or two concrete
 * next-step buttons — never a fabricated number/score/verdict standing in for "no data yet".
 */
export function HomeEmptyPromptCard({ icon, title, subtitle, actions, compact = false }: Props) {
  const theme = useThemeColors();
  return (
    <View className={`bg-surface border border-theme rounded-2xl ${compact ? 'flex-1 p-3' : 'p-4 mb-4'}`}>
      <View
        className={`rounded-xl items-center justify-center ${compact ? 'w-8 h-8 mb-2' : 'w-10 h-10 mb-2.5'}`}
        style={{ backgroundColor: tint(theme.primary, 10) }}
      >
        <Icon name={icon} size={compact ? 15 : 18} color={theme.primary} />
      </View>
      <Text className={`font-bold text-primary ${compact ? 'text-[12.5px]' : 'text-[13.5px]'}`}>{title}</Text>
      <Text
        className={`text-secondary leading-relaxed mt-0.5 ${compact ? 'text-[10.5px]' : 'text-[11.5px]'}`}
        numberOfLines={compact ? 2 : undefined}
      >
        {subtitle}
      </Text>
      <View className={`flex-row gap-2 ${compact ? 'mt-2' : 'mt-2.5'}`}>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            onPress={a.onPress}
            className={`rounded-full ${compact ? 'px-3 py-1.5' : 'px-3.5 py-2'}`}
            style={{ backgroundColor: a.variant === 'secondary' ? tint(theme.primary, 12) : theme.primary }}
          >
            <Text
              className={`font-bold ${compact ? 'text-[10.5px]' : 'text-[11.5px]'}`}
              style={{ color: a.variant === 'secondary' ? theme.primary : '#fff' }}
            >
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
