import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useThemeColors } from '~/theme/useThemeColors';

interface ProgressBarProps {
  /** 0–100 */
  value: number;
  /** Hex color. Defaults to the theme's brand primary. */
  color?: string;
  /** Track height. Defaults to 'sm'. */
  size?: 'xs' | 'sm' | 'md';
  /** Whether the fill transitions to its new width, matching web's opt-in `animate` prop (its CSS
   *  `transition` on `width` is not the default — most call sites pass `animate` explicitly, but a few,
   *  e.g. `GlanceHeader`/`OptimizeTab`/one bar in `RetirementCard`, deliberately don't). Defaults to
   *  `false` so callers that don't pass it match web's static-by-default behavior. */
  animate?: boolean;
}

const HEIGHT = { xs: 'h-1', sm: 'h-1.5', md: 'h-2.5' } as const;

export function ProgressBar({ value, color, size = 'sm', animate = false }: ProgressBarProps) {
  const theme = useThemeColors();
  const pct = Math.min(100, Math.max(0, value));
  const animatedPct = useSharedValue(pct);

  useEffect(() => {
    animatedPct.value = animate ? withTiming(pct, { duration: 400 }) : pct;
  }, [pct, animate, animatedPct]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${animatedPct.value}%`
  }));

  return (
    <View className={`w-full ${HEIGHT[size]} rounded-full bg-surface-3`}>
      <Animated.View
        className={`${HEIGHT[size]} rounded-full`}
        style={[{ backgroundColor: color ?? theme.primary }, animatedStyle]}
      />
    </View>
  );
}
