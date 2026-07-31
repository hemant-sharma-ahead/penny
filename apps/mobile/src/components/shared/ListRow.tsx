import type { ReactNode } from 'react';
import { View } from 'react-native';
import { IconBadge } from '~/components/ui/IconBadge';

interface ListRowProps {
  icon: string;
  iconColor: string;
  /** Defaults to iconColor + '18' */
  iconBg?: string;
  iconSize?: 'sm' | 'md' | 'lg';
  title: ReactNode;
  /** Secondary line below title */
  subtitle?: ReactNode;
  /** Content column to the right of title/subtitle */
  right?: ReactNode;
  /** Vertical alignment of icon vs content. Default 'start'. */
  align?: 'start' | 'center';
  className?: string;
}

export function ListRow({
  icon,
  iconColor,
  iconBg,
  iconSize = 'md',
  title,
  subtitle,
  right,
  align = 'start',
  className = ''
}: ListRowProps) {
  return (
    <View className={`flex-row ${align === 'center' ? 'items-center' : 'items-start'} gap-3 ${className}`}>
      <IconBadge icon={icon} color={iconColor} bg={iconBg} size={iconSize} />
      <View className="flex-1">
        {title}
        {subtitle !== undefined && <View className="mt-0.5">{subtitle}</View>}
      </View>
      {right !== undefined && <View className="items-end gap-0.5">{right}</View>}
    </View>
  );
}
