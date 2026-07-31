import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

/** A labelled row for one optional "Life & household" field — shared by Edit Profile and the
 *  onboarding "A bit more about you" screen so both stay visually identical. */
export function LifeRow({
  icon,
  label,
  alignTop,
  children
}: {
  icon: string;
  label: string;
  alignTop?: boolean;
  children: ReactNode;
}) {
  const theme = useThemeColors();
  return (
    <View
      className={`flex-row ${alignTop ? 'items-start' : 'items-center'} justify-between gap-3 py-3 border-t border-theme`}
    >
      <View className="flex-row items-center gap-2 shrink-0">
        <Icon name={icon} size={17} color={theme.textTertiary} />
        <Text className="text-[13px] font-medium text-secondary">{label}</Text>
      </View>
      {children}
    </View>
  );
}
