import { useEffect, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated';
import { Modal, Toggle } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useReduceMotion } from '~/hooks/useReduceMotion';
import { getItem, setItem } from '~/lib/storage';
import { TICKER_CONFIGS, fetchMarketTickers, type TickerId, type TickerResult } from '@/core/market/marketDataClient';

// Web's storage key (apps/web-legacy/src/features/home/MarketTicker.tsx via marketDataClient's
// loadEnabledTickers/saveEnabledTickers) — kept identical so the two apps' persisted picks agree.
const STORAGE_KEY = 'penny_market_tickers_enabled';
// Web's @keyframes penny-marquee (apps/web-legacy/src/index.css:303-315): translateX 0 → -50% of a
// doubled track, linear, 32s, infinite, jump-cut back to 0 (not reverse). RN has no CSS keyframes, so
// this is reanimated's standard seamless-marquee recipe: render the content twice back-to-back, measure
// one copy's width via onLayout, then withRepeat(withTiming(-width, linear, 32s), reverse: false) —
// each rep restarts from 0, which lands exactly on the second (identical) copy, so the jump is invisible.
// Web also pauses the animation on `:hover`; there's no hover on touch devices, so that's dropped here.
const MARQUEE_DURATION_MS = 32_000;

const defaultEnabled = () => new Set(TICKER_CONFIGS.map((c) => c.id));

async function loadEnabledTickersAsync(): Promise<Set<TickerId>> {
  try {
    const raw = await getItem(STORAGE_KEY);
    if (!raw) return defaultEnabled();
    return new Set(JSON.parse(raw) as TickerId[]);
  } catch {
    return defaultEnabled();
  }
}

async function saveEnabledTickersAsync(ids: TickerId[]): Promise<void> {
  await setItem(STORAGE_KEY, JSON.stringify(ids));
}

function MarqueeTrack({ shown }: { shown: TickerResult[] }) {
  const theme = useThemeColors();
  const reduceMotion = useReduceMotion();
  const [copyWidth, setCopyWidth] = useState(0);
  const translateX = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion || copyWidth <= 0) return;
    translateX.value = 0;
    translateX.value = withRepeat(
      withTiming(-copyWidth, { duration: MARQUEE_DURATION_MS, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(translateX);
  }, [reduceMotion, copyWidth, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: reduceMotion ? 0 : translateX.value }] }));

  // Web's `@media (prefers-reduced-motion: reduce)` disables the `@keyframes` marquee entirely (found
  // unhonored on mobile via the 2026-07-25 parity sweep) — a single static copy, not a paused animation,
  // since the second copy exists only to make the loop seamless while scrolling.
  const copies = reduceMotion ? [0] : [0, 1];

  return (
    <Animated.View className="flex-row" style={animatedStyle}>
      {copies.map((copy) => (
        <View
          key={copy}
          className="flex-row items-center gap-6 pr-6"
          onLayout={copy === 0 ? (e) => setCopyWidth(e.nativeEvent.layout.width) : undefined}
          {...(copy === 1
            ? { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }
            : {})}
        >
          {shown.map((t) => {
            const up = t.changePct !== null && t.changePct >= 0;
            const changeColor = t.changePct === null ? theme.textTertiary : up ? theme.success : theme.danger;
            return (
              <View key={`${copy}-${t.id}`} className="flex-row items-center gap-1.5">
                <Text className="text-[12px] font-semibold text-secondary">{t.label}</Text>
                <Text className="text-[12px] font-semibold text-primary tabular-nums">
                  {t.price !== null ? t.formatValue(t.price) : '—'}
                </Text>
                {t.changePct !== null && (
                  <Text className="text-[12px] font-medium tabular-nums" style={{ color: changeColor }}>
                    {up ? '▲' : '▼'} {Math.abs(t.changePct).toFixed(2)}%
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </Animated.View>
  );
}

function LoadingSkeleton() {
  const opacity = useSharedValue(0.4);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View className="flex-row items-center gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Animated.View key={i} className="w-20 h-4 rounded bg-surface-2" style={style} />
      ))}
    </View>
  );
}

/** Slim, scrollable market ticker tape at the top of Home — the standard placement users expect. */
export function MarketTicker() {
  const theme = useThemeColors();
  const [enabled, setEnabled] = useState<Set<TickerId>>(defaultEnabled);
  const [tickers, setTickers] = useState<TickerResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);

  // RN port note: web reads its persisted picks synchronously from localStorage at first render;
  // AsyncStorage is async, so this starts at the safe "all enabled" default and hydrates here — same
  // pattern as PrivacyContext/SettingsContext.
  useEffect(() => {
    let cancelled = false;
    loadEnabledTickersAsync().then((ids) => {
      if (!cancelled) setEnabled(ids);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-fetch whenever the enabled set changes (so toggling a ticker updates the strip immediately).
  useEffect(() => {
    const ids = TICKER_CONFIGS.filter((c) => enabled.has(c.id)).map((c) => c.id);
    let cancelled = false;
    const p = ids.length ? fetchMarketTickers(ids) : Promise.resolve<TickerResult[]>([]);
    p.then((r) => {
      if (cancelled) return;
      setTickers(r);
      setLoading(false);
    }).catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  function toggleTicker(id: TickerId) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveEnabledTickersAsync(TICKER_CONFIGS.filter((c) => next.has(c.id)).map((c) => c.id));
      return next;
    });
  }

  // Drop a just-disabled ticker instantly (before the re-fetch resolves).
  const shown = tickers.filter((t) => enabled.has(t.id));

  if (!loading && shown.length === 0 && enabled.size === 0) return null;

  return (
    <>
      <View className="bg-surface rounded-xl flex-row items-center pr-1 border border-theme">
        <View className="flex-1 overflow-hidden px-3 py-2">
          {loading ? <LoadingSkeleton /> : <MarqueeTrack shown={shown} />}
        </View>
        <Pressable
          onPress={() => setManageOpen(true)}
          accessibilityLabel="Manage market tickers"
          className="w-7 h-7 items-center justify-center rounded-lg"
        >
          <Icon name="ti-dots" size={16} color={theme.textTertiary} />
        </Pressable>
      </View>

      {manageOpen && (
        <Modal onClose={() => setManageOpen(false)} title="Market tickers">
          <View className="flex-col -mx-4">
            {TICKER_CONFIGS.map((c, i) => (
              <View
                key={c.id}
                className={`flex-row items-center gap-3 px-4 py-3.5 ${i > 0 ? 'border-t border-theme' : ''}`}
              >
                <View className="flex-1">
                  <Text className="text-sm font-medium text-primary">{c.label}</Text>
                  <Text className="text-xs text-tertiary">{c.sublabel}</Text>
                </View>
                <Toggle value={enabled.has(c.id)} onChange={() => toggleTicker(c.id)} />
              </View>
            ))}
          </View>
          <Text className="text-[11px] text-tertiary text-center mt-4">
            Prices refresh every 15 minutes · Indices, metals & forex
          </Text>
        </Modal>
      )}
    </>
  );
}
