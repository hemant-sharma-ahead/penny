import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * RN equivalent of web's `@media (prefers-reduced-motion: reduce)` — the OS-level accessibility setting
 * a browser applies for free via CSS, with no such automatic behavior on native. Found unhonored via the
 * 2026-07-25 parity sweep (Home's `MarketTicker` marquee ran regardless of this setting). Reads the
 * current value on mount and subscribes to live changes, since a user can toggle it while the app is
 * running.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
