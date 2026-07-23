import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { useThemeColors } from '~/theme/useThemeColors';

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface ProgressRingProps {
  /** 0–100 */
  percentage: number;
  color: string;
  /** Diameter in px. Default 72. */
  size?: number;
  strokeWidth?: number;
  /** Label shown inside the ring. Defaults to "{percentage}%". Pass null to hide. */
  label?: string | null;
}

export function ProgressRing({ percentage, color, size = 72, strokeWidth = 10, label }: ProgressRingProps) {
  const theme = useThemeColors();
  const pct = Math.min(100, Math.max(0, percentage));
  const dashOffset = CIRCUMFERENCE * (1 - pct / 100);
  const displayLabel = label === undefined ? `${Math.round(pct)}%` : label;

  return (
    <Svg viewBox="0 0 100 100" width={size} height={size}>
      <Circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth={strokeWidth} stroke={theme.border} />
      <Circle
        cx="50"
        cy="50"
        r={RADIUS}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={String(CIRCUMFERENCE)}
        strokeDashoffset={String(dashOffset)}
        rotation="-90"
        origin="50, 50"
      />
      {displayLabel !== null && (
        <SvgText x="50" y="55" textAnchor="middle" fontSize="18" fontWeight="700" fill={theme.textPrimary}>
          {displayLabel}
        </SvgText>
      )}
    </Svg>
  );
}
