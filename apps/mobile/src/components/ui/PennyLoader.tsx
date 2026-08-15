import { useEffect } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';

export type PennyLoaderSize = 'sm' | 'lg';

interface PennyLoaderProps {
  /** `'sm'` (default) plays the rotating-coin treatment at button-inline scale (20px); `'lg'` plays the
   *  pulse/breathing treatment at standalone scale (72px). The size IS the animation-style selector —
   *  no separate `variant` prop, per the approved mockup's own recommendation
   *  (docs/mockups/proposals/branded-busy-indicator-v1.html: "ship Treatment 1 as PennyLoader's only
   *  mode for v1" for the small/inline case, with Treatment 2/pulse approved for the large/standalone
   *  case in review — avoid a "pick your spinner style" dial before any screen has asked for one). */
  size?: PennyLoaderSize;
  accessibilityLabel?: string;
}

const DIAMETER: Record<PennyLoaderSize, number> = { sm: 20, lg: 72 };

// Timings are judgment calls carried over from the mockup's own (unmeasured-on-device) placeholders —
// flagged there as starting points, not settled values.
const ROTATE_MS = 1100; // one revolution
const PULSE_HALF_MS = 850; // one direction of the breathe cycle; a full in+out breath is ~1.7s

/**
 * The coin medallion only — gold radial-gradient circle + sprout — not the full square `PennyLogo` icon
 * with its horizon/sky background behind the coin. Spinning/pulsing that whole square reads oddly (the
 * horizon tilts through nonsensical angles mid-rotation); the coin itself is inherently circular and
 * reads cleanly at any rotation angle or scale. Same gradient stops/paths as `PennyWordmark`'s inline
 * coin (see `PennyLogo.tsx`) — reused exactly, not redrawn, so the mark stays visually identical
 * wherever it appears. The hardcoded gold hex values here mirror `PennyLogo.tsx`'s own — a documented
 * brand-mark exception to the "semantic tokens only" rule (see `docs/DESIGN_GUIDELINES.md`), not a
 * hardcoded-colour lapse.
 */
function CoinMedallion({ size }: { size: number }) {
  const id = `penny-loader-coin-${size}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Defs>
        <RadialGradient id={id} cx="35%" cy="26%" r="80%">
          <Stop offset="0%" stopColor="#ffefc2" />
          <Stop offset="40%" stopColor="#f6c74b" />
          <Stop offset="100%" stopColor="#8a5a12" />
        </RadialGradient>
      </Defs>
      <Circle cx="16" cy="16" r="15" fill={`url(#${id})`} />
      <Circle cx="16" cy="16" r="15" fill="none" stroke="rgba(74,42,6,0.35)" strokeWidth="1" />
      <Path d="M16 22V14" stroke="#6b430d" strokeWidth="2" strokeLinecap="round" />
      <Path d="M16 17 C14 16 11 14 12 11 C13 8 16 10 16 14" fill="#fff8ec" opacity={0.95} />
      <Path d="M16 15 C18 14 21 12 20 9 C19 6 16 8 16 12" fill="#fff8ec" />
    </Svg>
  );
}

/**
 * Penny's branded busy/loading indicator (see docs/mockups/proposals/branded-busy-indicator-v1.html).
 * Wired into `Button.tsx`'s `loading` prop at `size="sm"` (replacing the generic `ActivityIndicator`),
 * and usable standalone at `size="lg"` for a full-area busy state (initial sync, PDF/CSV parsing, a Chip
 * request, etc.) — mobile-only; `apps/web-react` is frozen and keeps its existing generic spinner
 * un-mirrored, per the mockup's explicit scope note.
 *
 * Driven by `react-native-reanimated` (`useSharedValue`/`withRepeat`/`withTiming`), matching this
 * codebase's established continuous-loop pattern (see `Icon.tsx`'s `spin` prop and
 * `ToastContext.tsx`'s countdown bar) rather than a naive `setInterval` or CSS-only animation.
 */
export function PennyLoader({ size = 'sm', accessibilityLabel = 'Loading' }: PennyLoaderProps) {
  const diameter = DIAMETER[size];
  // Double duty by design: for `sm` this counts degrees (0→360, one continuous rotation loop); for `lg`
  // it's a 0→1 breathe phase bounced back and forth by `withRepeat(..., -1, true)`. Only one of
  // `rotateStyle`/`pulseStyle` below is ever applied to the rendered node for a given `size`, so the two
  // interpretations never collide at runtime.
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value =
      size === 'sm'
        ? withRepeat(withTiming(360, { duration: ROTATE_MS, easing: Easing.linear }), -1)
        : withRepeat(withTiming(1, { duration: PULSE_HALF_MS, easing: Easing.inOut(Easing.quad) }), -1, true);
    // `progress` (a `useSharedValue`) has a stable identity across renders, same as a ref — including it
    // here is correct and harmless (the effect still only re-runs when `size` actually changes), and
    // avoids needing an eslint-disable for something the linter just can't infer about a third-party hook.
  }, [size, progress]);

  const rotateStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${progress.value}deg` }] }));
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.9 + progress.value * 0.16 }],
    opacity: 0.55 + progress.value * 0.45
  }));

  return (
    <Animated.View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={size === 'sm' ? rotateStyle : pulseStyle}
    >
      <CoinMedallion size={diameter} />
    </Animated.View>
  );
}
