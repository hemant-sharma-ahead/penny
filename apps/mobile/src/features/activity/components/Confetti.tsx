import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

const COLORS = ['#00a86b', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#06b6d4'];
const PIECES = Array.from({ length: 18 }, (_, i) => i);
const FALL_MS = 1400;

function ConfettiPiece({ index }: { index: number }) {
  const left = (index * 53) % 100;
  const delay = (index % 6) * 120;
  const color = COLORS[index % COLORS.length];
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: FALL_MS, easing: Easing.in(Easing.quad) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount, mirrors web's one-shot fall animation
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: progress.value * 220 }, { rotate: `${progress.value * 180}deg` }],
    opacity: 1 - progress.value * 0.8
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: `${left}%`,
          width: 6,
          height: 10,
          borderRadius: 1,
          backgroundColor: color
        },
        style
      ]}
    />
  );
}

/**
 * RN port of apps/web-legacy/src/features/activity/components/Confetti.tsx. Web animates via a CSS
 * `@keyframes confetti-fall`; no RN equivalent, so this drives each piece with a `react-native-reanimated`
 * `withTiming`/`withDelay` fall+fade, same visual idea (18 staggered pieces dropping and fading out).
 */
export function Confetti() {
  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
      {PIECES.map((i) => (
        <ConfettiPiece key={i} index={i} />
      ))}
    </View>
  );
}
