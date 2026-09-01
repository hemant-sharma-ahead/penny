import { useEffect, useState } from 'react';
import { Pressable, View, Text } from 'react-native';
import { tint, ink } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import { Icon } from '~/components/Icon';
import { toDateKey } from '@/lib/date';
import { DID_YOU_KNOW_FACTS } from '@/core/tips/didYouKnowFacts';
import { getDailyTipEnabled, getDailyTipState, setDailyTipState } from '~/lib/tipsStorage';

const CURATED = DID_YOU_KNOW_FACTS.filter((f) => f.curated);

interface Props {
  onSeeAll: () => void;
}

/**
 * Home's daily tip card (2026-08-16) — sits at the very top of Home, above the at-a-glance summary,
 * deliberately: Home is the most-visited screen, so a daily tip earns the most eyes there (a real
 * back-and-forth with the user settled this over an initial placement lower down the screen — see
 * `docs/features/did-you-know-tips.md`).
 *
 * Reveals ONE curated tip a day (never more) — advances `revealedCount` the first time this mounts on a
 * new calendar day. Tap cycles back through only the tips already revealed so far, never ahead of the
 * daily pace (so tapping through can't blow past "one new thing a day"). Dismissing hides it for the
 * rest of today only; a new day always gets its own fresh chance. Once every curated tip has been shown
 * once, this stops rendering on Home entirely — by then Discover Penny (`onSeeAll`) is the known place to
 * keep exploring, so nothing lingers past its usefulness. Can be turned off entirely from Discover
 * Penny's own toggle (default on) — `revealedCount` still advances in the background while off, so
 * re-enabling resumes the sequence rather than restarting it.
 */
export function DailyTipCard({ onSeeAll }: Props) {
  const theme = useThemeColors();
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [revealedCount, setRevealedCount] = useState(0);
  const [viewIdx, setViewIdx] = useState(0);
  const [dismissedToday, setDismissedToday] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [on, state] = await Promise.all([getDailyTipEnabled(), getDailyTipState()]);
      if (cancelled) return;
      const today = toDateKey(Date.now());
      let { revealedCount: count, lastRevealedDateKey } = state;
      if (lastRevealedDateKey !== today && count < CURATED.length) {
        count += 1;
        lastRevealedDateKey = today;
        await setDailyTipState({ revealedCount: count, lastRevealedDateKey, dismissedDateKey: state.dismissedDateKey });
      }
      if (cancelled) return;
      setEnabled(on);
      setRevealedCount(count);
      setViewIdx(Math.max(0, count - 1));
      setDismissedToday(state.dismissedDateKey === today);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDismiss() {
    setDismissedToday(true);
    const state = await getDailyTipState();
    await setDailyTipState({ ...state, dismissedDateKey: toDateKey(Date.now()) });
  }

  if (!ready || !enabled || dismissedToday || revealedCount === 0) return null;

  const fact = CURATED[viewIdx];
  if (!fact) return null;
  const color = theme.info;

  return (
    <Pressable
      onPress={() => setViewIdx((i) => (i + 1) % revealedCount)}
      accessibilityLabel="Show another tip"
      className="rounded-xl border p-3 flex-row gap-2 mb-4"
      style={{ backgroundColor: tint(color, 12), borderColor: tint(color, 30) }}
    >
      <Icon name="ti-bulb" size={16} color={color} />
      <View className="flex-1 gap-0.5" style={{ paddingRight: 20 }}>
        <Text
          className="text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: ink(color, theme.textPrimary) }}
        >
          Did you know?
        </Text>
        <Text className="text-xs leading-relaxed" style={{ color: ink(color, theme.textPrimary) }}>
          {fact.text}
        </Text>
        <View className="flex-row items-center justify-between mt-0.5">
          <Text className="text-[10px]" style={{ color: ink(color, theme.textPrimary), opacity: 0.7 }}>
            {revealedCount > 1 ? 'Tap to revisit an earlier tip' : 'A new one tomorrow'}
          </Text>
          <Pressable onPress={onSeeAll} hitSlop={6}>
            <Text className="text-[10px] font-semibold" style={{ color }}>
              See all tips →
            </Text>
          </Pressable>
        </View>
      </View>
      <Pressable
        onPress={() => void handleDismiss()}
        hitSlop={8}
        accessibilityLabel="Dismiss"
        className="absolute top-2 right-2 w-5 h-5 items-center justify-center rounded-full"
      >
        <Icon name="ti-x" size={12} color={ink(color, theme.textPrimary)} />
      </Pressable>
    </Pressable>
  );
}
