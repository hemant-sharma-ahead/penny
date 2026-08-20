import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '~/components/Icon';
import { tint } from '~/lib/color';

interface IconBadgeProps {
  icon: string;
  color: string;
  /** sm = 32x32, md = 40x40 (default), lg = 48x48 */
  size?: 'sm' | 'md' | 'lg';
  /** Background color override — defaults to color + 10% tint */
  bg?: string | undefined;
  className?: string;
  /** Overrides the rendered icon element entirely (e.g. `BankLogo` for a real per-bank logo) while
   *  keeping this badge's box/background sizing driven by `size`/`bg` unchanged. `icon`/`color` above
   *  still apply as-is when this is omitted. */
  iconElement?: ReactNode;
}

const SIZE = {
  sm: { box: 'w-8 h-8 rounded-lg', icon: 16 },
  md: { box: 'w-10 h-10 rounded-xl', icon: 20 },
  lg: { box: 'w-12 h-12 rounded-xl', icon: 24 }
} as const;

export function IconBadge({ icon, color, size = 'md', bg, className = '', iconElement }: IconBadgeProps) {
  const { box, icon: iconSize } = SIZE[size];
  return (
    <View
      className={`${box} items-center justify-center shrink-0 ${className}`}
      style={{ backgroundColor: bg ?? tint(color, 9) }}
    >
      {iconElement ?? <Icon name={icon} size={iconSize} color={color} />}
    </View>
  );
}
