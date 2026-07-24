import { View, Text, ScrollView } from 'react-native';
import Svg, { G, Rect, Polyline, Circle, Text as SvgText } from 'react-native-svg';
import { formatCompact } from '@/lib/formatters';
import { useThemeColors } from '~/theme/useThemeColors';
import type { MonthPoint } from '@/core/expenses/annualAnalytics';

interface Props {
  series: MonthPoint[]; // 12 months, this year
  prevYear: MonthPoint[]; // 12 months, last year (for ghost bars)
  max: number;
  masked: boolean;
  onSelectMonth: (month: string) => void;
}

const COL = 54; // px per month column (chart scrolls horizontally)
const TOP = 18; // headroom for value labels
const PLOT = 78; // bar plot height
const BOTTOM = 18; // month-label row
const H = TOP + PLOT + BOTTOM;

/**
 * RN port of apps/web-legacy/src/features/expenses/analytics/AnnualChart.tsx. Same viewBox-scaled SVG
 * (`Rect`/`Polyline`/`Text` map directly to their web counterparts), wrapped in a horizontal `ScrollView`
 * instead of `overflow-x-auto`. Tap targets use `react-native-svg`'s native `onPress` on the transparent
 * per-column `Rect` directly (touch events work fine on SVG shapes here) rather than an overlay of RN
 * `Pressable`s — simpler, and the column is wide enough (54px) that hit-precision isn't an issue.
 */
export function AnnualChart({ series, prevYear, max, masked, onSelectMonth }: Props) {
  const theme = useThemeColors();
  const n = series.length;
  const W = n * COL;
  const open = !masked;
  const bw = COL * 0.46;
  const y = (v: number) => TOP + PLOT - (Math.max(0, v) / max) * PLOT;
  const cx = (i: number) => i * COL + COL / 2;

  const firstProjected = series.findIndex((p) => p.projected);
  const projStart = firstProjected === -1 ? n : firstProjected;
  const actualPts = series
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i < projStart)
    .map(({ p, i }) => `${cx(i).toFixed(1)},${y(p.income).toFixed(1)}`);
  const projPts = series
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i >= projStart - 1 && projStart > 0)
    .map(({ p, i }) => `${cx(i).toFixed(1)},${y(p.income).toFixed(1)}`);

  return (
    <View className="-mx-1 px-1">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
          {series.map((p, i) => {
            const prev = prevYear[i];
            const center = cx(i);
            const tappable = !p.projected && (p.expense > 0 || p.income > 0);
            return (
              <G key={p.month}>
                {prev && prev.expense > 0 && (
                  <Rect
                    x={center - bw / 2 + bw * 0.2}
                    y={y(prev.expense)}
                    width={bw}
                    height={TOP + PLOT - y(prev.expense)}
                    rx={2}
                    fill={theme.textTertiary}
                    opacity={0.16}
                  />
                )}
                <Rect
                  x={center - bw / 2}
                  y={y(p.expense)}
                  width={bw}
                  height={TOP + PLOT - y(p.expense)}
                  rx={2}
                  fill={theme.primary}
                  opacity={p.projected ? 0.28 : 0.7}
                />
                {open && p.expense > 0 && (
                  <SvgText
                    x={center}
                    y={y(p.expense) - 4}
                    textAnchor="middle"
                    fontSize={8.5}
                    fill={theme.textSecondary}
                  >
                    {formatCompact(p.expense).replace('₹', '')}
                  </SvgText>
                )}
                <SvgText x={center} y={H - 5} textAnchor="middle" fontSize={9} fill={theme.textTertiary}>
                  {p.label}
                </SvgText>
                {/* Full-column tap target → open that month */}
                {tappable && (
                  <Rect
                    x={i * COL}
                    y={0}
                    width={COL}
                    height={H}
                    fill="transparent"
                    onPress={() => onSelectMonth(p.month)}
                  />
                )}
              </G>
            );
          })}
          {actualPts.length > 1 && (
            <Polyline
              points={actualPts.join(' ')}
              fill="none"
              stroke={theme.success}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          )}
          {projPts.length > 1 && (
            <Polyline
              points={projPts.join(' ')}
              fill="none"
              stroke={theme.success}
              strokeWidth={2}
              strokeDasharray="4 3"
              opacity={0.7}
            />
          )}
          {series.map((p, i) => (
            <Circle
              key={`d-${p.month}`}
              cx={cx(i)}
              cy={y(p.income)}
              r={1.8}
              fill={theme.success}
              opacity={p.projected ? 0.5 : 1}
            />
          ))}
        </Svg>
      </ScrollView>

      <View className="flex-row items-center justify-center gap-3 mt-2">
        <View className="flex-row items-center gap-1">
          <View className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: theme.primary, opacity: 0.7 }} />
          <Text className="text-[10px] text-tertiary">Expense</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <View className="w-3 h-0.5 rounded" style={{ backgroundColor: theme.success }} />
          <Text className="text-[10px] text-tertiary">Income</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <View className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: theme.textTertiary, opacity: 0.16 }} />
          <Text className="text-[10px] text-tertiary">Last year</Text>
        </View>
        <Text className="text-[10px] text-tertiary opacity-70">· tap a month · faded = projected</Text>
      </View>
    </View>
  );
}
