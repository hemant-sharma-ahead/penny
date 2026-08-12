import { useEffect, useState } from 'react';
import { View, Animated } from 'react-native';
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

/**
 * Uses React Native's CORE `Animated` API, not `react-native-reanimated` (2026-08-08 fix — found via
 * real device/web testing: every progress bar in the app rendered essentially unfilled on the RN-Web
 * target, regardless of the real percentage). Reanimated's web runtime is built around animating
 * `transform`/`opacity` (hardware-accelerated, no layout reflow) — animating a LAYOUT property like
 * `width` via a Reanimated worklet on web silently fails to apply, unlike on native where its UI-thread
 * driver handles layout properties fine. Core `Animated` + `useNativeDriver: false` (required for any
 * non-transform/opacity property on ANY platform, not just web) uses the plain JS-driven animation path,
 * which `react-native-web` supports correctly for `width` — this is the standard, well-established way
 * to animate a layout property across native and web alike, unlike Reanimated's native-first design.
 */
export function ProgressBar({ value, color, size = 'sm', animate = false }: ProgressBarProps) {
  const theme = useThemeColors();
  const pct = Math.min(100, Math.max(0, value));
  // `useState` lazy-initializer, not `useRef` (2026-08-08 lint fix) — the newer `react-hooks/refs`
  // rule flags a `useRef(...).current` read during render (including passing it into `.interpolate()`
  // below) as an impure-render hazard, even for this long-established "stable mutable Animated.Value"
  // pattern. `useState(() => ...)` gives the same "created once, stable across renders" guarantee
  // without ever exposing a ref object — the setter is intentionally never called.
  const [widthAnim] = useState(() => new Animated.Value(pct));

  useEffect(() => {
    if (animate) {
      Animated.timing(widthAnim, { toValue: pct, duration: 400, useNativeDriver: false }).start();
    } else {
      widthAnim.setValue(pct);
    }
  }, [pct, animate, widthAnim]);

  const widthStyle = widthAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  return (
    <View className={`w-full ${HEIGHT[size]} rounded-full bg-surface-3`}>
      <Animated.View
        className={`${HEIGHT[size]} rounded-full`}
        style={{ backgroundColor: color ?? theme.primary, width: widthStyle }}
      />
    </View>
  );
}
