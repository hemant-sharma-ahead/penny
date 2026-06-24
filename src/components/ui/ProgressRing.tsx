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
  const pct = Math.min(100, Math.max(0, percentage));
  const dashOffset = CIRCUMFERENCE * (1 - pct / 100);
  const displayLabel = label === undefined ? `${Math.round(pct)}%` : label;

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${Math.round(pct)}%`}>
      <circle
        cx="50"
        cy="50"
        r={RADIUS}
        fill="none"
        strokeWidth={strokeWidth}
        style={{ stroke: 'var(--color-border)' }}
      />
      <circle
        cx="50"
        cy="50"
        r={RADIUS}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={String(CIRCUMFERENCE)}
        strokeDashoffset={String(dashOffset)}
        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
      />
      {displayLabel !== null && (
        <text
          x="50"
          y="55"
          textAnchor="middle"
          fontSize="18"
          fontWeight="700"
          style={{ fill: 'var(--color-text-primary)' }}
        >
          {displayLabel}
        </text>
      )}
    </svg>
  );
}
