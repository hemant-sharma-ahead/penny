import { useEffect, useMemo, type ComponentType } from 'react';
import * as TablerIcons from '@tabler/icons-react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

/**
 * Resolves the web app's icon convention (Tabler webfont classes, e.g. `ti-alert-triangle`) to the
 * matching `@tabler/icons-react-native` SVG component (`IconAlertTriangle`). This is the single seam
 * every ported component uses instead of `<i className="ti ti-x" />` — callers keep passing the exact
 * same icon-name strings as today (feature code across the app calls these with hundreds of distinct
 * names), so no call site needs to change when its screen is ported in Track 4.
 *
 * Known tradeoff: dynamic name lookup means the whole icon set is bundled (no per-icon tree-shaking) —
 * acceptable for now; revisit only if bundle size becomes a real problem (Track 6 territory).
 */
function toComponentName(tablerClassName: string): string {
  const slug = tablerClassName.replace(/^ti-/, '');
  const pascal = slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return `Icon${pascal}`;
}

export interface IconProps {
  /** Same string used today as `ti ${name}` webfont classes, e.g. 'ti-alert-triangle'. */
  name: string;
  size?: number;
  color?: string;
  /** Matches web's `animate-spin` Tabler/Tailwind class, conditioned on an in-flight boolean (refresh
   *  buttons, price-fetching states). RN has no CSS class equivalent, so this drives a continuous
   *  `react-native-reanimated` rotation instead — added 2026-07-31 after the parity sweep found every
   *  such icon (portfolio's price-refresh/MF-search spinners, subscriptions/news/backup's refresh
   *  buttons) was static on mobile. `ActivityIndicator`-based loading states are unaffected by this gap
   *  (native RN primitive, already spins on its own) and don't need this prop. */
  spin?: boolean;
  /** Renders Tabler's solid "Filled" variant of this icon instead of the outline one (2026-08-02, added
   *  for the Goal card's icon-fill gauge — `GoalCard.tsx`'s `IconFillGauge`). Not every icon has one;
   *  falls back to the outline component rather than rendering nothing if `${name}Filled` doesn't exist,
   *  so a caller doesn't need to know in advance which icons Tabler shipped a filled variant for. */
  filled?: boolean;
}

type TablerIconComponent = ComponentType<{ size?: number | string; color?: string }>;

export function Icon({ name, size = 16, color, spin, filled }: IconProps) {
  // Memoized per-instance on `name`/`filled` so the string-parsing + dynamic lookup above only reruns
  // when either actually changes, not on every re-render of every mounted Icon (found in the 2026-07-26
  // parity sweep — disproportionately costly given how many Icon instances mount at once across
  // Transactions/Budgets/Analytics/Category tiles). A shared module-level cache was tried first but
  // rejected: mutating module state during render trips this repo's React Compiler lint rules
  // (`react-hooks/immutability`/`static-components`) — `useMemo` is the sanctioned mechanism instead.
  const IconComponent = useMemo(() => {
    const table = TablerIcons as unknown as Record<string, TablerIconComponent>;
    const componentName = toComponentName(name);
    if (filled) return table[`${componentName}Filled`] ?? table[componentName] ?? null;
    return table[componentName] ?? null;
  }, [name, filled]);

  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = spin ? withRepeat(withTiming(360, { duration: 800, easing: Easing.linear }), -1) : 0;
  }, [spin, rotation]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  // Unmatched names render nothing rather than crash — this repo's no-console rule (see CLAUDE.md)
  // doesn't allow a dev-only warning here without disabling it, and a missing icon is a visible-in-UI
  // problem anyway (an empty spot), so it's self-evident during Track 4's manual per-screen checks.
  if (!IconComponent) return null;
  if (!spin) return <IconComponent size={size} color={color} />;
  return (
    <Animated.View style={animatedStyle}>
      <IconComponent size={size} color={color} />
    </Animated.View>
  );
}
