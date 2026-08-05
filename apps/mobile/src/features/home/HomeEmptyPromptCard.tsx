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
}

/**
 * Shared "nothing here yet" card for Home's widgets (net worth, spend/insurance/loans) —
 * `docs/mockups/proposals/home-empty-states-v2.html`. Same visual language across all of them: an
 * icon tile, a title stating plainly what's missing, a one-line explanation, and one or two concrete
 * next-step buttons — never a fabricated number/score/verdict standing in for "no data yet".
 */
export function HomeEmptyPromptCard({ icon, title, subtitle, actions }: Props) {
  const theme = useThemeColors();
  return (
    <View className="bg-surface border border-theme rounded-2xl p-4 mb-4">
      <View
        className="w-10 h-10 rounded-xl items-center justify-center mb-2.5"
        style={{ backgroundColor: tint(theme.primary, 10) }}
      >
        <Icon name={icon} size={18} color={theme.primary} />
      </View>
      <Text className="text-[13.5px] font-bold text-primary">{title}</Text>
      <Text className="text-[11.5px] text-secondary leading-relaxed mt-0.5">{subtitle}</Text>
      <View className="flex-row gap-2 mt-2.5">
        {actions.map((a) => (
          <Pressable
            key={a.label}
            onPress={a.onPress}
            className="rounded-full px-3.5 py-2"
            style={{ backgroundColor: a.variant === 'secondary' ? tint(theme.primary, 12) : theme.primary }}
          >
            <Text
              className="text-[11.5px] font-bold"
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
