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
  /** Optional bold lead-in rendered on its own line above `children` — web's own two-`<p>` pattern
   *  (`<p className="font-semibold">`/`<p className="text-xs ... mt-0.5">`) for outcome banners with a
   *  headline + explanation. Without this, a caller passing two strings as `children` collapses them
   *  into one run with no line break, since RN's `Text` has no block-level child layout the way `<p>`
   *  siblings do in the DOM — found via the 2026-07-25 parity sweep (Calculators' outcome banners). */
  title?: string;
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
export function Banner({ variant, icon, title, children, className = '' }: BannerProps) {
  const theme = useThemeColors();
  const color = theme[variant];
  const iconName = icon === undefined ? DEFAULT_ICON[variant] : icon;
  const textColor = ink(color, theme.textPrimary);

  return (
    <View
      className={`rounded-xl border p-3 flex-row gap-2 ${className}`}
      style={{ backgroundColor: tint(color, 12), borderColor: tint(color, 30) }}
    >
      {iconName && <Icon name={iconName} size={16} color={color} />}
      <View className="flex-1">
        {title && (
          <Text className="text-sm font-semibold" style={{ color: textColor }}>
            {title}
          </Text>
        )}
        <Text className={`text-xs leading-relaxed ${title ? 'mt-0.5' : ''}`} style={{ color: textColor }}>
          {children}
        </Text>
      </View>
    </View>
  );
}
