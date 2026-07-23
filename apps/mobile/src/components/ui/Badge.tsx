import { View, Text } from 'react-native';
import { tint } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';

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
}

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

export function Badge({ label, color, variant = 'subtle', size = 'md', rounded = 'full' }: BadgeProps) {
  const theme = useThemeColors();
  const resolvedColor = color ?? theme.primary;
  const style = variant === 'solid' ? { backgroundColor: resolvedColor } : { backgroundColor: tint(resolvedColor) };
  const textColor = variant === 'solid' ? '#fff' : resolvedColor;

  return (
    <View className={`items-center justify-center ${SIZE_CLASS[size]} ${ROUNDED_CLASS[rounded]}`} style={style}>
      <Text className={`font-semibold leading-none ${TEXT_SIZE[size]}`} style={{ color: textColor }}>
        {label}
      </Text>
    </View>
  );
}
