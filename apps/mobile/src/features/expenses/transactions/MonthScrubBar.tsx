import { useCallback, useEffect, useRef } from 'react';
import { View, Pressable, ScrollView, Text, type LayoutChangeEvent } from 'react-native';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { monthChipLabel } from '@/lib/date';

interface MonthScrubBarProps {
  /** Ascending chronological order (oldest first) — the earliest recorded transaction's month
   *  through the current calendar month. See `TransactionsSlice.tsx` for how this is built. */
  months: string[];
  /** Item 15 (docs/mockups/proposals/punch-list-batch-v1.html §1) — every `YYYY-MM` month that has
   *  at least one transaction (`useTransactionFilters.ts`'s `monthsWithTxns`). A month in `months`
   *  but absent here is rendered dimmed (lower opacity) — still a normal, fully tappable chip, just
   *  visually deprioritized as "empty but valid," never disabled. */
  monthsWithTxns: Set<string>;
  /** `null` means "All time" (no month filter) — drives the pinned "All" chip's selected state. */
  selected: string | null;
  onSelectMonth: (m: string) => void;
  onSelectAll: () => void;
  /** Opens the real `MonthPickerModal`, unchanged — the "jump further back than is comfortable to
   *  reach by scrolling" escape hatch. */
  onOpenPicker: () => void;
}

/**
 * Persistent horizontal month-scrub bar (item 43, docs/plans/real-device-testing-pass.md Phase 5;
 * design approved via `docs/mockups/proposals/fourth-batch-redesigns-v5.html` §4, carried over
 * byte-for-byte from v4). Replaces the old single month-chip trigger that used to live in
 * `TransactionsSlice.tsx`'s top filter bar with this persistent, swipeable row of month chips
 * rendered below it.
 *
 * - A pinned "All" chip sits outside the scrollable strip (never scrolls away) and clears back to
 *   the unfiltered "All time" view in one tap.
 * - A calendar-icon button, also outside the strip, opens the real `MonthPickerModal` for jumping
 *   further back than is comfortable to reach by scrolling.
 * - The strip auto-scrolls to bring the selected month chip into view on mount and whenever
 *   `selected` changes elsewhere (`FilterModal`, `MonthPickerModal`).
 * - Item 15 (docs/mockups/proposals/punch-list-batch-v1.html §1): a chip for a month with zero
 *   transactions renders at lower opacity — still fully tappable, just visually deprioritized.
 * - Item 13b (same mockup, §1): chip labels always include the year (`monthChipLabel()`), even
 *   for the current calendar year.
 */
export function MonthScrubBar({
  months,
  monthsWithTxns,
  selected,
  onSelectMonth,
  onSelectAll,
  onOpenPicker
}: MonthScrubBarProps) {
  const theme = useThemeColors();
  const scrollRef = useRef<ScrollView>(null);
  // Populated as each chip lays out (its `x` offset within the scroll content) via the chip's own
  // `onLayout` — a ref, not state: recording a layout must never itself trigger a re-render.
  const chipOffsets = useRef<Map<string, number>>(new Map());
  // Tracks a scroll that's still owed once the target chip's own `onLayout` fires — covers both the
  // initial mount (before any chip has laid out yet) and a later `selected` change landing on a chip
  // that also hasn't laid out yet (e.g. still off-screen).
  const pendingScrollTo = useRef<string | null>(selected);

  const scrollToX = useCallback((x: number) => {
    scrollRef.current?.scrollTo({ x: Math.max(0, x - 24), animated: true });
  }, []);

  /** Scrolls the given month's chip into view — deferred two `requestAnimationFrame` ticks past
   *  whatever triggered it (2026-08-21, found testing on RN-Web after the previous fix): an earlier
   *  version of this used `View.measureLayout` for a "fresh, not-stale" read at the moment of
   *  scrolling, which fixed the original bug (selecting "All" then re-selecting a month scrolled all
   *  the way left) on-device — but the same bug resurfaced on RN-Web specifically. `measureLayout` is
   *  a native-bridge measurement call; react-native-web's shim for it doesn't reliably return
   *  scroll-aware coordinates the same way native's does, so a fix confirmed correct on-device
   *  silently didn't carry over to web. This drops `measureLayout` entirely in favor of the plain
   *  `onLayout`-cached offset (`chipOffsets`) — an ordinary layout number computed identically on
   *  every platform, not a native-bridge call — and fixes the *actual* staleness bug (a state update
   *  landing before that update's own layout pass has run) by deferring the read two animation frames
   *  instead, which is a standard, platform-uniform way to wait out a pending layout rather than
   *  racing it. */
  const scrollToMonth = useCallback(
    (m: string) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const x = chipOffsets.current.get(m);
          if (x === undefined) {
            // Still hasn't laid out (e.g. genuinely off-screen on first mount) — `handleChipLayout`
            // finishes the job itself once this chip's own `onLayout` eventually fires.
            pendingScrollTo.current = m;
            return;
          }
          scrollToX(x);
          pendingScrollTo.current = null;
        });
      });
    },
    [scrollToX]
  );

  useEffect(() => {
    // `selected === null` means "All" — item 13a: this used to be a no-op, leaving the strip
    // wherever it last was (reading as "slid to the left" on a fresh mount, since nothing had ever
    // scrolled it toward "now" yet). Land on the most recent month (the last entry — `months` is
    // ascending) instead, same as if that month chip had been tapped.
    const target = selected ?? months[months.length - 1];
    pendingScrollTo.current = target ?? null;
    if (target) scrollToMonth(target);
  }, [selected, months, scrollToMonth]);

  const handleChipLayout = useCallback(
    (m: string) => (e: LayoutChangeEvent) => {
      chipOffsets.current.set(m, e.nativeEvent.layout.x);
      if (pendingScrollTo.current === m) scrollToMonth(m);
    },
    [scrollToMonth]
  );

  const handleSelectMonth = useCallback(
    (m: string) => {
      onSelectMonth(m);
      // Direct tap — same deferred re-read `scrollToMonth` always does, so a width change caused by
      // this very selection (bold text, etc.) is accounted for before we scroll, not raced against.
      scrollToMonth(m);
    },
    [onSelectMonth, scrollToMonth]
  );

  return (
    <View className="flex-row items-center gap-[5px] px-[10px] py-2 border-b border-theme">
      <Pressable
        onPress={onSelectAll}
        className="shrink-0 px-3 py-2 rounded-[10px] border border-theme"
        style={{
          backgroundColor: selected === null ? theme.primary : theme.surfaceSecondary,
          borderColor: selected === null ? 'transparent' : theme.border
        }}
        accessibilityLabel="Show all transactions"
      >
        <Text
          className="text-[10.5px] font-extrabold"
          style={{ color: selected === null ? '#fff' : theme.textSecondary }}
        >
          All
        </Text>
      </Pressable>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-1"
        contentContainerStyle={{ gap: 6 }}
      >
        {months.map((m) => {
          const isSelected = selected === m;
          // Item 15 — an empty month is still a fully valid, tappable view of "no transactions
          // that month," just visually deprioritized; never disabled (`onPress` is unchanged).
          const isEmpty = !monthsWithTxns.has(m);
          return (
            <Pressable
              key={m}
              onLayout={handleChipLayout(m)}
              onPress={() => handleSelectMonth(m)}
              className="shrink-0 px-[11px] py-[7px] rounded-[10px] border border-theme"
              style={{
                backgroundColor: isSelected ? theme.primary : theme.surfaceSecondary,
                borderColor: isSelected ? 'transparent' : theme.border,
                opacity: isEmpty ? 0.45 : 1
              }}
            >
              <Text className="text-[10.5px] font-bold" style={{ color: isSelected ? '#fff' : theme.textSecondary }}>
                {monthChipLabel(m)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        onPress={onOpenPicker}
        className="shrink-0 w-8 h-8 items-center justify-center rounded-[10px] border border-theme"
        style={{ backgroundColor: theme.surfaceSecondary }}
        accessibilityLabel="Open month picker"
      >
        <Icon name="ti-calendar" size={15} color={theme.textSecondary} />
      </Pressable>
    </View>
  );
}
