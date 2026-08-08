import { View, type ViewStyle } from 'react-native';
import { useThemeColors } from '~/theme/useThemeColors';

interface ProgressBarProps {
  /** 0–100 */
  value: number;
  /** Hex color. Defaults to the theme's brand primary. */
  color?: string;
  /** Track height. Defaults to 'sm'. */
  size?: 'xs' | 'sm' | 'md';
  /** Whether the fill transitions to its new width. */
  animate?: boolean;
}

const HEIGHT = { xs: 'h-1', sm: 'h-1.5', md: 'h-2.5' } as const;

/**
 * Web-only variant (2026-08-08) — found via real device+web testing: switching the default/native
 * `ProgressBar.tsx` from `react-native-reanimated` to core RN `Animated` fixed the fill on
 * native/emulator, but the bar STILL rendered empty on the web target. Neither animation library
 * reliably drives a LAYOUT property (`width`) through react-native-web's style/DOM pipeline the way
 * a real browser's own CSS engine does. Since `width` is a plain, always-correctly-applied CSS
 * property in any browser, this file skips animation libraries entirely on web: a plain `View` with
 * a directly computed `width` percentage, using a raw CSS `transition` (react-native-web passes
 * style keys it doesn't recognize as RN-specific straight through to the underlying DOM style) for
 * the `animate` case instead of a JS-driven animation loop.
 */
export function ProgressBar({ value, color, size = 'sm', animate = false }: ProgressBarProps) {
  const theme = useThemeColors();
  const pct = Math.min(100, Math.max(0, value));

  const style: ViewStyle & {
    transitionProperty?: string;
    transitionDuration?: string;
    transitionTimingFunction?: string;
  } = {
    backgroundColor: color ?? theme.primary,
    width: `${pct}%`,
    ...(animate && { transitionProperty: 'width', transitionDuration: '400ms', transitionTimingFunction: 'ease-out' })
  };

  return (
    <View className={`w-full ${HEIGHT[size]} rounded-full bg-surface-3`}>
      <View className={`${HEIGHT[size]} rounded-full`} style={style} />
    </View>
  );
}
