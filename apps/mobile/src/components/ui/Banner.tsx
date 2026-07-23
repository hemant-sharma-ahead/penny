import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { tint, ink } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';

type BannerVariant = 'info' | 'warning' | 'danger' | 'success';

interface BannerProps {
  variant: BannerVariant;
  /** Tabler icon name; defaults to a sensible icon per variant. Pass null to hide. */
  icon?: string | null;
  children: ReactNode;
  className?: string;
}

const DEFAULT_ICON: Record<BannerVariant, string> = {
  info: 'ti-info-circle',
  warning: 'ti-alert-triangle',
  danger: 'ti-alert-triangle',
  success: 'ti-circle-check'
};

/**
 * Inline callout/alert — subtle tinted background, status-colored icon, and a readable
 * (theme-aware) message. RN equivalent of the web Banner (same variants/icons).
 */
export function Banner({ variant, icon, children, className = '' }: BannerProps) {
  const theme = useThemeColors();
  const color = theme[variant];
  const iconName = icon === undefined ? DEFAULT_ICON[variant] : icon;

  return (
    <View
      className={`rounded-xl border p-3 flex-row gap-2 ${className}`}
      style={{ backgroundColor: tint(color, 12), borderColor: tint(color, 30) }}
    >
      {iconName && <Icon name={iconName} size={16} color={color} />}
      <Text className="text-xs leading-relaxed flex-1" style={{ color: ink(color, theme.textPrimary) }}>
        {children}
      </Text>
    </View>
  );
}
