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
}

const HEIGHT = { xs: 'h-1', sm: 'h-1.5', md: 'h-2.5' } as const;

/**
 * Web's fill bar has a CSS `transition` on `width` (an `animate` prop, now dropped as unused since every
 * caller relied on the default). Ported now via `react-native-reanimated` (already a dependency, first
 * used by Home's `MarketTicker`) — found missing via the 2026-07-25 parity sweep.
 */
export function ProgressBar({ value, color, size = 'sm' }: ProgressBarProps) {
  const theme = useThemeColors();
  const pct = Math.min(100, Math.max(0, value));
  const animatedPct = useSharedValue(pct);

  useEffect(() => {
    animatedPct.value = withTiming(pct, { duration: 400 });
  }, [pct, animatedPct]);

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
