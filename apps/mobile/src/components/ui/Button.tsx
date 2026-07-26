import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Tabler icon class, e.g. 'ti-plus'. Rendered before children (or alone for icon-only buttons). */
  icon?: string;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  className?: string;
  /** Override background hex color for dynamic-color buttons (e.g. per-type expense buttons). */
  color?: string;
  /** Override text/icon color without setting a background — the `ghost`-variant equivalent of web's
   *  `style={{ color: 'var(--color-primary)' }}` (RN's `style` prop only reaches the outer `Pressable`,
   *  not the inner `Text`, so `color` alone can't do this without also forcing an opaque background). */
  textColor?: string;
  style?: ViewStyle;
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 rounded-lg gap-1',
  md: 'px-4 py-2.5 rounded-xl gap-1.5',
  lg: 'px-4 py-3 rounded-xl gap-2'
};

const TEXT_SIZE: Record<ButtonSize, string> = { sm: 'text-xs', md: 'text-sm', lg: 'text-sm' };
const ICON_SIZES: Record<ButtonSize, number> = { sm: 13, md: 15, lg: 16 };

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  onPress,
  disabled,
  loading,
  icon,
  fullWidth,
  accessibilityLabel,
  className = '',
  color,
  textColor: textColorOverride,
  style
}: ButtonProps) {
  const theme = useThemeColors();
  const iconOnly = !children && (icon || loading);
  const iconSize = ICON_SIZES[size];

  const variantClass = variant === 'secondary' || variant === 'ghost' ? 'bg-transparent' : '';
  const borderClass = variant === 'secondary' ? 'border border-theme' : '';

  const backgroundColor =
    color ?? (variant === 'primary' ? theme.primary : variant === 'danger' ? theme.danger : undefined);
  const textColor = textColorOverride ?? (backgroundColor ? '#fff' : theme.textSecondary);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled ?? loading}
      accessibilityLabel={accessibilityLabel}
      className={[
        'flex-row items-center justify-center',
        iconOnly ? 'aspect-square' : SIZE_CLASSES[size],
        fullWidth ? 'w-full' : '',
        variantClass,
        borderClass,
        (disabled ?? loading) ? 'opacity-50' : '',
        className
      ]
        .filter(Boolean)
        .join(' ')}
      style={[backgroundColor ? { backgroundColor } : undefined, style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        icon && <Icon name={icon} size={iconSize} color={textColor} />
      )}
      {children && (
        <Text className={`font-semibold ${TEXT_SIZE[size]}`} style={{ color: textColor }}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}
