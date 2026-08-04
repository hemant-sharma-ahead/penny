import { View, Text, Pressable } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { formatCurrency, formatCompact } from '@/lib/formatters';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { RetirementProjectionResult } from '@/core/calculators/retirementProjection';

const VIOLET_LIGHT = '#a78bfa';
const GAUGE_SIZE = 78;
const RADIUS = 33;
const STROKE = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface StatTileProps {
  label: string;
  value: number;
  open: boolean;
}

function StatTile({ label, value, open }: StatTileProps) {
  const theme = useThemeColors();
  return (
    // Beside the gauge (not below it, and the gauge itself doesn't move/resize) — 3 stacked-not-paired
    // mini tiles sharing this narrow leftover width. `formatCompact` ("₹18.2Cr" vs `formatCurrency`'s
    // "₹18,16,86,240") is what makes 3-across fit here at all; `numberOfLines` stays on as a real width
    // guard regardless, and the full precise amount is still one VoiceOver/TalkBack read away via
    // `accessibilityLabel`.
    <View className="flex-1 items-start gap-1">
      <Text
        className="text-[10.5px] font-medium"
        style={{ color: theme.textTertiary }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        {label}
      </Text>
      <Text
        className="text-[13px] font-bold"
        style={{ color: theme.textPrimary }}
        numberOfLines={1}
        accessibilityLabel={open ? `${label} ${formatCurrency(Math.round(value))}` : undefined}
      >
        {open ? formatCompact(value) : '••••'}
      </Text>
    </View>
  );
}

interface Props {
  projection: RetirementProjectionResult;
  monthlyInvestment: number;
  retirementYear: number;
  open: boolean;
  onOpenDrilldown: () => void;
}

/**
 * Sits below (not over) `RetirementCorpusChart` — a radial "% funded" gauge (same arc-progress
 * technique as `~/features/health/ScoreGauge.tsx`, reimplemented locally since feature modules can't
 * cross-import) with Needed/Projected/Monthly SIP as a row of 3 stat tiles to its right (gauge stays
 * fixed size/position; the tiles share whatever width is left), a CTA chip suggesting the monthly
 * top-up that closes any gap, and the *only* tap target that opens the expense-projection drill-down
 * (the chart above has its own scrub gesture instead — the two shouldn't compete for the same touch).
 */
export function RetirementFundedSummary({
  projection,
  monthlyInvestment,
  retirementYear,
  open,
  onOpenDrilldown
}: Props) {
  const theme = useThemeColors();
  const clamped = Math.min(100, Math.max(0, projection.percentFunded));
  const filled = (CIRCUMFERENCE * clamped) / 100;
  const gap = Math.round(projection.monthlyGapToClose);

  return (
    <View className="pt-2">
      <View className="flex-row items-center gap-4">
        <View style={{ width: GAUGE_SIZE, height: GAUGE_SIZE }}>
          <Svg width={GAUGE_SIZE} height={GAUGE_SIZE} viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}>
            <Circle
              cx={GAUGE_SIZE / 2}
              cy={GAUGE_SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={theme.border}
              strokeWidth={STROKE}
            />
            {filled > 1 && (
              <Circle
                cx={GAUGE_SIZE / 2}
                cy={GAUGE_SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={VIOLET_LIGHT}
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={`${filled} ${CIRCUMFERENCE - filled}`}
                rotation={-90}
                origin={`${GAUGE_SIZE / 2}, ${GAUGE_SIZE / 2}`}
              />
            )}
          </Svg>
          <View className="absolute inset-0 items-center justify-center">
            <Text className="text-[19px] font-extrabold" style={{ color: theme.textPrimary }}>
              {projection.percentFunded}%
            </Text>
            <Text className="text-[8px] text-center leading-tight" style={{ color: theme.textTertiary }}>
              funded
            </Text>
          </View>
        </View>
        <View className="flex-1 flex-row gap-1.5">
          <StatTile label="Needed" value={projection.corpusNeeded} open={open} />
          <StatTile label="Projected" value={projection.corpusProjected} open={open} />
          <StatTile label="Monthly SIP" value={monthlyInvestment} open={open} />
        </View>
      </View>

      <View
        className="mt-3.5 px-3 py-2.5 rounded-xl flex-row items-center gap-1.5"
        style={{ backgroundColor: 'rgba(139,92,246,0.14)' }}
      >
        <Icon name={gap > 0 ? 'ti-trending-up' : 'ti-check'} size={13} color={VIOLET_LIGHT} />
        <Text className="text-[11px] font-semibold flex-1" style={{ color: VIOLET_LIGHT }} numberOfLines={2}>
          {gap > 0
            ? `${open ? `+${formatCurrency(gap)}` : '+••••'}/mo closes this gap by ${retirementYear}`
            : `On track — fully funded by ${retirementYear}`}
        </Text>
      </View>

      <Pressable
        onPress={onOpenDrilldown}
        className="mt-2.5 flex-row items-center gap-1"
        accessibilityLabel="Tap for expense projection"
        hitSlop={6}
      >
        <Text className="text-[10px]" style={{ color: theme.textTertiary }}>
          Tap for expense projection
        </Text>
        <Icon name="ti-chevron-right" size={11} color={theme.textTertiary} />
      </Pressable>
    </View>
  );
}
