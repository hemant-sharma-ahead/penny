import { View, Text } from 'react-native';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import { Icon } from '~/components/Icon';

type BadgeVariant = 'solid' | 'subtle';
type BadgeSize = 'sm' | 'md';
type BadgeRounded = 'full' | 'md';

interface BadgeProps {
  label: string;
  /** Hex color — e.g. theme.success, or a domain color hex. Defaults to the theme's brand primary. */
  color?: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  /** Pill (default) or squarer corners for compact inline tags. */
  rounded?: BadgeRounded;
  /** Applies `text-transform: capitalize` — matches web's own `capitalize` Tailwind class on badges
   *  whose label is a raw lowercase enum value (e.g. Goals' risk badge, `goal.risk`). Found missing via
   *  the 2026-07-25 parity sweep. */
  capitalize?: boolean;
  /** Tabler icon name rendered before the label — e.g. Goals' "Suggested" badge's `ti-sparkles`. Found
   *  missing (no icon slot at all) via the 2026-07-25 parity sweep. */
  icon?: string;
}

const ICON_SIZE: Record<BadgeSize, number> = { sm: 9, md: 11 };

const SIZE_CLASS: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5',
  md: 'px-2.5 py-1'
};

const TEXT_SIZE: Record<BadgeSize, string> = {
  sm: 'text-[10px]',
  md: 'text-xs'
};

const ROUNDED_CLASS: Record<BadgeRounded, string> = {
  full: 'rounded-full',
  md: 'rounded'
};

export function Badge({
  label,
  color,
  variant = 'subtle',
  size = 'md',
  rounded = 'full',
  capitalize,
  icon
}: BadgeProps) {
  const theme = useThemeColors();
  const resolvedColor = color ?? theme.primary;
  const style = variant === 'solid' ? { backgroundColor: resolvedColor } : { backgroundColor: tint(resolvedColor) };
  const textColor = variant === 'solid' ? '#fff' : resolvedColor;

  return (
    <View
      className={`flex-row items-center justify-center gap-0.5 ${SIZE_CLASS[size]} ${ROUNDED_CLASS[rounded]}`}
      style={style}
    >
      {icon && <Icon name={icon} size={ICON_SIZE[size]} color={textColor} />}
      <Text
        className={`font-semibold leading-none ${TEXT_SIZE[size]} ${capitalize ? 'capitalize' : ''}`}
        style={{ color: textColor }}
      >
        {label}
      </Text>
    </View>
  );
}
