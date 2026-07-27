import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { useThemeColors } from '~/theme/useThemeColors';

/** 270° SVG arc gauge rendering a 0–100 health score. */
export function ScoreGauge({ score, color }: { score: number; color: string }) {
  const theme = useThemeColors();
  const R = 68;
  const cx = 90;
  const cy = 90;
  const C = 2 * Math.PI * R;
  const arcLength = C * 0.75;
  const filled = (arcLength * Math.min(100, Math.max(0, score))) / 100;

  return (
    <Svg width="100%" height="100%" viewBox="0 0 180 155">
      <Circle
        cx={cx}
        cy={cy}
        r={R}
        fill="none"
        stroke={theme.border}
        strokeWidth={14}
        strokeDasharray={`${arcLength} ${C * 0.25}`}
        strokeLinecap="round"
        rotation={135}
        origin={`${cx}, ${cy}`}
      />
      {filled > 2 && (
        <Circle
          cx={cx}
          cy={cy}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeDasharray={`${filled} ${C - filled}`}
          strokeLinecap="round"
          rotation={135}
          origin={`${cx}, ${cy}`}
        />
      )}
      <SvgText x={cx} y={82} textAnchor="middle" fill={theme.textPrimary} fontSize="42" fontWeight="700">
        {score}
      </SvgText>
      <SvgText x={cx} y={104} textAnchor="middle" fill={theme.textTertiary} fontSize="13">
        out of 100
      </SvgText>
    </Svg>
  );
}
