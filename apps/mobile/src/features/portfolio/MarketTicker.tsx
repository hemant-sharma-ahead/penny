import { useEffect, useState } from 'react';
import { View, Pressable, Text, ScrollView } from 'react-native';
import { Modal, Toggle } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { getItem, setItem } from '~/lib/storage';
import {
  TICKER_CONFIGS,
  fetchMarketTickers,
  MARKET_TICKERS_ENABLED_KEY,
  type TickerId,
  type TickerResult
} from '@/core/market/marketDataClient';

// Shared with web's MarketTicker.tsx via marketDataClient's own loadEnabledTickers/saveEnabledTickers
// (which use the same exported key) — no independently-duplicated literal to silently diverge.
const STORAGE_KEY = MARKET_TICKERS_ENABLED_KEY;

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

function TickerCard({ t }: { t: TickerResult }) {
  const theme = useThemeColors();
  const up = t.changePct !== null && t.changePct >= 0;
  const changeColor = t.changePct === null ? theme.textTertiary : up ? theme.success : theme.danger;
  return (
    <View className="bg-surface-2 border border-theme rounded-lg px-2.5 py-1.5" style={{ minWidth: 74 }}>
      <Text className="text-[9px] font-semibold text-tertiary" numberOfLines={1}>
        {t.label}
      </Text>
      <Text className="text-xs font-bold text-primary tabular-nums mt-0.5">
        {t.price !== null ? t.formatValue(t.price) : '—'}
      </Text>
      {t.changePct !== null && (
        <Text className="text-[9px] font-semibold tabular-nums mt-0.5" style={{ color: changeColor }}>
          {up ? '▲' : '▼'} {Math.abs(t.changePct).toFixed(2)}%
        </Text>
      )}
    </View>
  );
}

function LoadingSkeleton() {
  return (
    <View className="flex-row items-center gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} className="w-[74px] h-[46px] rounded-lg bg-surface-2" />
      ))}
    </View>
  );
}

/**
 * Market strip — 2026-08-01 Portfolio consolidation: moved from Home into `PortfolioPage.tsx` (pinned
 * above the main asset-class tabs, visible regardless of which one is active — Sensex/Nifty/Gold aren't
 * Equity-specific). Also dropped the continuous auto-scrolling marquee for a static row of small cards,
 * swiped manually — per your call, easier to actually read a card's numbers than one drifting past
 * continuously. `react-native-reanimated`'s seamless-marquee machinery (`useSharedValue`/`withRepeat`/
 * the double-copy width-measuring trick) is gone entirely with it, not just replaced.
 */
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
      <View className="flex-row items-center gap-1.5">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-1"
          contentContainerStyle={{ gap: 6 }}
        >
          {loading ? <LoadingSkeleton /> : shown.map((t) => <TickerCard key={t.id} t={t} />)}
        </ScrollView>
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
