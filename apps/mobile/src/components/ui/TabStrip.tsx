import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  Text,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { tint } from '~/lib/color';

interface TabOption<T extends string> {
  value: T;
  label: string;
  /** Optional Tabler icon class, e.g. 'ti-chart-bar' */
  icon?: string;
  /** Badge count shown as a small pill on the tab */
  count?: number;
}

interface TabStripProps<T extends string> {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Allow the strip to scroll horizontally when there are many tabs */
  scrollable?: boolean;
}

/** Width of the edge-fade gradient hinting there's more to scroll to — same idea as `StoriesRow.tsx`'s
 *  own scroll affordances, sized small enough to read as a hint, not a visible chunk of missing tab. */
const EDGE_FADE_WIDTH = 24;

/**
 * Redesigned 2026-08-11 (`docs/mockups/proposals/tabstrip-redesign-v1.html`, on-device feedback: the
 * active-tab state was "very very subtle," and a `scrollable` strip gave no signal there were more
 * tabs off-screen). Two independent changes:
 *
 * - **Active-tab visual weight ("Option D")** — a tinted backdrop + bold text + colored underline,
 *   instead of a bare color change. Applies to every `TabStrip`, scrollable or not.
 * - **Auto-center-scroll + edge fade (`scrollable` only)** — the active tab scrolls toward the
 *   horizontal center of the strip, both when the user taps a different tab AND once on mount (an
 *   explicit decision — not tap-only), so a middle tab reveals a sliver of its neighbors on both
 *   sides. A tab already at the first/last position naturally stays put — there's nowhere further to
 *   center toward, `centerOnActiveTab`'s own clamping handles this without special-casing it. The
 *   first centering (mount) is instant, not animated, so the strip doesn't visibly slide right after
 *   the screen appears; every later one (a real tap) animates. A soft `expo-linear-gradient` fade at
 *   either edge — visible even before any tap, whenever real overflow exists — hints "there's more"
 *   without requiring an interaction first.
 */
export function TabStrip<T extends string>({ options, value, onChange, scrollable = false }: TabStripProps<T>) {
  const theme = useThemeColors();
  const modeBg = useModeBackgroundColor();
  const scrollRef = useRef<ScrollView>(null);
  const tabLayouts = useRef(new Map<T, { x: number; width: number }>());
  const hasCenteredOnceRef = useRef(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [scrollX, setScrollX] = useState(0);

  const centerOnActiveTab = useCallback(() => {
    if (!scrollable || containerWidth === 0 || contentWidth === 0) return;
    const layout = tabLayouts.current.get(value);
    if (!layout) return;
    const maxScroll = Math.max(0, contentWidth - containerWidth);
    if (maxScroll === 0) return; // every tab already fully visible — nothing to center
    const target = layout.x + layout.width / 2 - containerWidth / 2;
    const clamped = Math.max(0, Math.min(target, maxScroll));
    scrollRef.current?.scrollTo({ x: clamped, animated: hasCenteredOnceRef.current });
    hasCenteredOnceRef.current = true;
  }, [scrollable, value, containerWidth, contentWidth]);

  // Fires whenever the container/content dimensions settle, or `value` changes (a tap) — covers most
  // orderings, but RN gives no guarantee the ACTIVE tab's own `onLayout` resolves before or after the
  // container/content ones, so each tab's own `onLayout` below ALSO retries centering directly when
  // it's the active one — whichever of the three (container, content, active-tab) actually settles
  // LAST is the one that succeeds; the other, earlier attempts just no-op via the guards above.
  useEffect(() => {
    centerOnActiveTab();
  }, [centerOnActiveTab]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollX(e.nativeEvent.contentOffset.x);
  }, []);

  const row = (
    <View className="flex-row">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            onLayout={(e: LayoutChangeEvent) => {
              tabLayouts.current.set(opt.value, { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width });
              if (active) centerOnActiveTab();
            }}
            className="flex-row items-center gap-1.5 px-4 py-2.5 border-b-2 rounded-t-lg"
            style={{
              borderColor: active ? theme.primary : 'transparent',
              backgroundColor: active ? tint(theme.primary, 10) : undefined
            }}
          >
            {opt.icon && <Icon name={opt.icon} size={15} color={active ? theme.primary : theme.textTertiary} />}
            <Text
              className={`text-sm ${active ? 'font-bold' : 'font-medium'}`}
              style={{ color: active ? theme.primary : theme.textTertiary }}
            >
              {opt.label}
            </Text>
            {opt.count !== undefined && opt.count > 0 && (
              <View
                className="rounded-full px-1.5 py-0.5"
                style={{ backgroundColor: active ? theme.primary : theme.surfaceTertiary }}
              >
                <Text
                  className="text-xs font-semibold leading-none"
                  style={{ color: active ? '#fff' : theme.textSecondary }}
                >
                  {opt.count}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );

  if (!scrollable) return <View className="border-b border-theme">{row}</View>;

  const maxScroll = Math.max(0, contentWidth - containerWidth);
  const showLeftFade = scrollX > 2;
  const showRightFade = maxScroll > 2 && scrollX < maxScroll - 2;

  return (
    <View
      className="border-b border-theme"
      onLayout={(e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width)}
      style={{ position: 'relative' }}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        // Without an explicit flexGrow: 0, a horizontal ScrollView placed as a flex child in a column
        // layout stretches to fill all remaining vertical space (it becomes the tallest sibling), pushing
        // its own content down to vertically center inside that oversized box instead of hugging its
        // content height like the non-scrollable `row` above does.
        style={{ flexGrow: 0 }}
      >
        <View onLayout={(e: LayoutChangeEvent) => setContentWidth(e.nativeEvent.layout.width)}>{row}</View>
      </ScrollView>
      {showLeftFade && (
        <LinearGradient
          colors={[modeBg, `${modeBg}00`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ position: 'absolute', left: 0, top: 0, bottom: 1, width: EDGE_FADE_WIDTH }}
          pointerEvents="none"
        />
      )}
      {showRightFade && (
        <LinearGradient
          colors={[`${modeBg}00`, modeBg]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ position: 'absolute', right: 0, top: 0, bottom: 1, width: EDGE_FADE_WIDTH }}
          pointerEvents="none"
        />
      )}
    </View>
  );
}
