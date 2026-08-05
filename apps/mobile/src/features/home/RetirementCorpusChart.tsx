import { useMemo, useState } from 'react';
import { View, Text, type GestureResponderEvent } from 'react-native';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Line } from 'react-native-svg';
import { formatCompact } from '@/lib/formatters';
import { useTheme } from '~/theme/ThemeProvider';
import { useThemeColors } from '~/theme/useThemeColors';
import type { CorpusChartPoint } from './useRetirementProjection';

// Fixed brand accent, not theme-reactive — same documented exception `~/theme/tokens.ts`'s per-domain
// accents already use (e.g. `privacy`'s violet). Matches the approved mockup
// (docs/mockups/proposals/home-networth-projection-v4.html) exactly: `#8b5cf6`/`#a78bfa`. Unlike the
// mockup's own always-dark page chrome, this hero has **no card background** (decision #3) — it sits
// directly on Home's real theme-reactive screen background, so every non-accent text/line color below
// reads from `useThemeColors()` instead of assuming a dark backdrop.
const VIOLET = '#8b5cf6';
const VIOLET_LIGHT = '#a78bfa';
const VIOLET_LIGHTEST = '#c4b5fd';
const AMBER = '#f0b060';
// `VIOLET_LIGHTEST` is a pale lavender chosen for the dark-theme screen background this hero was
// designed against — on light theme's white background it's ~1.9:1 contrast, unreadable (found
// 2026-08-04). Same violet identity, dark enough to read on white for the two labels that are real text
// (not a decorative line/fill) rendered with no card background underneath them.
//
// Both "today" and "projected" labels stay in the same violet family as their own chart dots (today's
// dot is `VIOLET_LIGHTEST`, projected's is `VIOLET_LIGHT`) — the "today" label used to fall back to
// `theme.textTertiary` (a plain gray, unrelated to its own dot's color), which read as a mismatched,
// duller label next to "projected"'s violet in light theme especially (found 2026-08-05). "Today" gets
// the lighter of the two shades, "projected" the bolder one — distinguishable from each other, both
// clearly violet.
const VIOLET_TODAY_TEXT_LIGHT = '#7c3aed';
const VIOLET_PROJECTED_TEXT_LIGHT = '#6d28d9';

const CHART_H = 250;
const TOP_PAD = 42; // headroom for the dashed target marker + flag pill
const BOTTOM_PAD = 22;
const X_INSET = 6;

interface Props {
  points: CorpusChartPoint[]; // ascending by t; includes exactly one 'today' point
  retirementYear: number;
  /** Privacy-mode visibility for the rupee value tags (percent-funded/gauge elsewhere stays visible,
   *  matching how net worth's own masking policy treats aggregates vs raw amounts). */
  open: boolean;
}

/**
 * Chart for Home's Retirement Corpus hero — plots **investable corpus** (not net worth, a deliberately
 * different, smaller figure; see `core/calculators/retirementProjection.ts`). Every point is mapped
 * from `points`' real computed values, never a decorative hardcoded curve shape. `GlanceHeader` overlays
 * the net-worth text on this chart's top-left corner; the expense-projection drill-down opens only from
 * `RetirementFundedSummary`'s own "Tap for expense projection" row below, never from tapping the chart —
 * dragging across the chart instead scrubs it (see the responder handlers below), so the two gestures
 * don't compete for the same touch.
 */
export function RetirementCorpusChart({ points, retirementYear, open }: Props) {
  const theme = useThemeColors();
  const { activePalette } = useTheme();
  const todayTextColor = activePalette === 'light' ? VIOLET_TODAY_TEXT_LIGHT : VIOLET_LIGHTEST;
  const projectedTextColor = activePalette === 'light' ? VIOLET_PROJECTED_TEXT_LIGHT : VIOLET_LIGHT;
  const [width, setWidth] = useState(0);
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);

  const layout = useMemo(() => {
    const first = points[0];
    const lastPoint = points[points.length - 1];
    if (!first || !lastPoint || width === 0) return null;
    const minT = first.t;
    const maxT = lastPoint.t;
    const values = points.map((p) => p.value);
    const minV = 0;
    const maxV = Math.max(...values, 1) * 1.15;
    const plotW = width - X_INSET * 2;
    const plotH = CHART_H - TOP_PAD - BOTTOM_PAD;

    const x = (t: number) => X_INSET + (maxT === minT ? plotW : ((t - minT) / (maxT - minT)) * plotW);
    const y = (v: number) => TOP_PAD + plotH * (1 - (v - minV) / (maxV - minV || 1));

    const coords = points.map((p) => ({ x: x(p.t), y: y(p.value), kind: p.kind }));
    const firstCoord = coords[0];
    const lastCoord = coords[coords.length - 1];
    if (!firstCoord || !lastCoord) return null;
    const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L${lastCoord.x.toFixed(1)},${CHART_H} L${firstCoord.x.toFixed(1)},${CHART_H} Z`;

    const todayIdx = points.findIndex((p) => p.kind === 'today');
    const today = coords[todayIdx] ?? firstCoord;

    return { coords, linePath, areaPath, today, last: lastCoord };
  }, [points, width]);

  const todayValue = points.find((p) => p.kind === 'today')?.value ?? points[0]?.value ?? 0;
  const projectedValue = points[points.length - 1]?.value ?? 0;

  // Drag-to-scrub: finds the nearest plotted point to the touch's x position and shows a dashed
  // vertical line + value bubble at it, live, while the finger is down — released on touch end. Plain
  // RN responder handlers (no PanResponder/gesture-handler needed for a single-axis nearest-point pick).
  const scrubAt = (e: GestureResponderEvent) => {
    if (!layout) return;
    const touchX = e.nativeEvent.locationX;
    let nearest = 0;
    let bestDist = Infinity;
    layout.coords.forEach((c, i) => {
      const d = Math.abs(c.x - touchX);
      if (d < bestDist) {
        bestDist = d;
        nearest = i;
      }
    });
    setScrubIdx(nearest);
  };
  const scrubPoint = scrubIdx !== null ? (points[scrubIdx] ?? null) : null;
  const scrubCoord = scrubIdx !== null ? (layout?.coords[scrubIdx] ?? null) : null;
  const scrubOnRightHalf = width > 0 && !!scrubCoord && scrubCoord.x > width / 2;

  return (
    <View
      style={{ height: CHART_H }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={scrubAt}
      onResponderMove={scrubAt}
      onResponderRelease={() => setScrubIdx(null)}
      onResponderTerminate={() => setScrubIdx(null)}
    >
      {/* Corner glow blooms — same technique as AccountList's mini-card sheen, ported to this borderless
          hero (see docs/DESIGN_GUIDELINES.md's "fused borderless hero" pattern entry). */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: -10,
          top: -30,
          width: 170,
          height: 170,
          borderRadius: 85,
          opacity: 0.22,
          backgroundColor: VIOLET
        }}
      />
      {/* This corner blob is a barely-perceptible depth vignette against dark theme's own dark
          background, but on light theme's white background a black blob at the same opacity reads as
          a visible dark smudge — sitting directly under the "Corpus ... today" label (bottom-left,
          below) and muddying its already-muted `textTertiary` gray on top of it (found 2026-08-05, the
          real reason that label stayed unreadable in light theme even after its own color was fixed). */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: -30,
          bottom: -40,
          width: 130,
          height: 130,
          borderRadius: 65,
          opacity: activePalette === 'light' ? 0.04 : 0.25,
          backgroundColor: '#000'
        }}
      />

      {/* Diagonal light-sheen streak — oversized rotated gradient band, same technique as AccountList's
          mini-card sheen (see docs/DESIGN_GUIDELINES.md's "fused borderless hero" pattern entry). */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: '-30%',
          left: '-10%',
          width: '140%',
          height: '160%',
          transform: [{ rotate: '-8deg' }],
          overflow: 'hidden',
          opacity: 0.4
        }}
      >
        <ExpoLinearGradient
          colors={['transparent', theme.borderStrong, 'transparent']}
          locations={[0.42, 0.5, 0.58]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.4 }}
          style={{ flex: 1 }}
        />
      </View>

      {width > 0 && layout && (
        <Svg width={width} height={CHART_H} style={{ position: 'absolute', inset: 0 }}>
          <Defs>
            <LinearGradient id="corpusFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={VIOLET} stopOpacity={0.45} />
              <Stop offset="100%" stopColor={VIOLET} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={layout.areaPath} fill="url(#corpusFill)" />
          <Path d={layout.linePath} fill="none" stroke={VIOLET_LIGHT} strokeWidth={2.75} strokeLinecap="round" />
          {/* Dashed target marker + flag dot above the retirement-year point */}
          <Line
            x1={layout.last.x}
            y1={layout.last.y}
            x2={layout.last.x}
            y2={Math.max(8, layout.last.y - 20)}
            stroke={AMBER}
            strokeWidth={1.6}
            strokeDasharray="3,3"
          />
          <Circle cx={layout.last.x} cy={Math.max(8, layout.last.y - 20)} r={3.5} fill={AMBER} />
          <Circle cx={layout.last.x} cy={layout.last.y} r={4.5} fill={VIOLET_LIGHT} />
          <Circle cx={layout.today.x} cy={layout.today.y} r={4.5} fill={VIOLET_LIGHTEST} />

          {/* Scrub indicator — live while dragging across the chart (see the responder handlers above). */}
          {scrubCoord && (
            <>
              <Line
                x1={scrubCoord.x}
                y1={scrubCoord.y}
                x2={scrubCoord.x}
                y2={CHART_H - 2}
                stroke={theme.textPrimary}
                strokeWidth={1}
                strokeDasharray="3,4"
                opacity={0.55}
              />
              <Circle cx={scrubCoord.x} cy={scrubCoord.y} r={5} fill={theme.textPrimary} />
            </>
          )}
        </Svg>
      )}

      {scrubPoint && scrubCoord && (
        <View
          pointerEvents="none"
          className={`absolute px-2.5 py-1.5 rounded-lg ${scrubOnRightHalf ? 'items-end' : 'items-start'}`}
          style={[
            {
              top: Math.max(2, scrubCoord.y - 40),
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.borderStrong
            },
            scrubOnRightHalf
              ? { right: Math.max(2, width - scrubCoord.x + 8) }
              : { left: Math.max(2, scrubCoord.x + 8) }
          ]}
        >
          <Text className="text-[9px]" style={{ color: theme.textTertiary }}>
            {new Date(scrubPoint.t).getFullYear()}
          </Text>
          <Text className="text-[11px] font-bold" style={{ color: theme.textPrimary }}>
            {open ? formatCompact(scrubPoint.value) : '••••'}
          </Text>
        </View>
      )}

      {/* Flag pill — top-right, over the curve's high point */}
      <View
        className="absolute right-2 top-3.5 px-2.5 py-1 rounded-lg"
        style={{
          backgroundColor: AMBER,
          shadowColor: '#000',
          shadowOpacity: 0.4,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 }
        }}
      >
        <Text className="text-[9.5px] font-extrabold" style={{ color: '#1a1206' }}>
          🏁 Retiring {retirementYear}
        </Text>
      </View>

      {/* Muted value tags disambiguating this series (investable corpus) from the net-worth number
          overlaid on the same unit. The "today" tag sits below the chart's own bottom padding
          (BOTTOM_PAD), not near the today-point's actual height — placed at the curve's own height it
          was landing almost exactly where the today dot/line are, so the curve hid it. */}
      <View className="absolute left-2" style={{ bottom: 4 }}>
        <Text className="text-[9px] font-semibold" style={{ color: todayTextColor }}>
          {open ? `Corpus ${formatCompact(todayValue)} · today` : 'Corpus •••• · today'}
        </Text>
      </View>
      {/* Anchored to the projected point's real x/y (layout.last), not a fixed offset — the marker moves
          with the actual data, so a fixed position drifted away from it depending on how funded the
          plan is. Sits just left of the dot, roughly at its own height, clear of the line/fill rather
          than sitting on top of either. */}
      <View
        className="absolute items-end"
        style={
          layout
            ? { top: Math.max(2, layout.last.y - 5), right: Math.max(2, width - layout.last.x + 10) }
            : { top: CHART_H - 80, right: 8 }
        }
      >
        <Text className="text-[9px] font-bold" style={{ color: projectedTextColor }}>
          {open ? `${formatCompact(projectedValue)} proj.` : '•••• proj.'}
        </Text>
      </View>
    </View>
  );
}
