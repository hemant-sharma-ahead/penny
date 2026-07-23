import { View } from 'react-native';
import { useThemeColors } from '~/theme/useThemeColors';

interface ProgressBarProps {
  /** 0–100 */
  value: number;
  /** Hex color. Defaults to the theme's brand primary. */
  color?: string;
  /** Track height. Defaults to 'sm'. */
  size?: 'xs' | 'sm' | 'md';
  // Note: web's `animate` (CSS transition on width) is dropped — animating a width change on RN needs
  // Reanimated, not worth adding until a real caller (Track 4) needs it.
}

const HEIGHT = { xs: 'h-1', sm: 'h-1.5', md: 'h-2.5' } as const;

export function ProgressBar({ value, color, size = 'sm' }: ProgressBarProps) {
  const theme = useThemeColors();
  const pct = Math.min(100, Math.max(0, value));

  return (
    <View className={`w-full ${HEIGHT[size]} rounded-full bg-surface-3`}>
      <View
        className={`${HEIGHT[size]} rounded-full`}
        style={{ width: `${pct}%`, backgroundColor: color ?? theme.primary }}
      />
    </View>
  );
}
