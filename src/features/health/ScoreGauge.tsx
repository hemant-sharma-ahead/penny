/** 270° SVG arc gauge rendering a 0–100 health score. */
export function ScoreGauge({ score, color }: { score: number; color: string }) {
  const R = 68;
  const cx = 90;
  const cy = 90;
  const C = 2 * Math.PI * R;
  const arcLength = C * 0.75;
  const filled = (arcLength * Math.min(100, Math.max(0, score))) / 100;

  return (
    <svg viewBox="0 0 180 155" aria-label={`Health score: ${score} out of 100`}>
      {/* Background track */}
      <circle
        cx={cx}
        cy={cy}
        r={R}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth={14}
        strokeDasharray={`${C * 0.75} ${C * 0.25}`}
        strokeLinecap="round"
        transform={`rotate(135, ${cx}, ${cy})`}
      />
      {/* Score fill */}
      {filled > 2 && (
        <circle
          cx={cx}
          cy={cy}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeDasharray={`${filled} ${C - filled}`}
          strokeLinecap="round"
          transform={`rotate(135, ${cx}, ${cy})`}
        />
      )}
      {/* Score text */}
      <text x={cx} y={82} textAnchor="middle" fill="var(--color-text-primary)" fontSize="42" fontWeight="700">
        {score}
      </text>
      <text x={cx} y={104} textAnchor="middle" fill="var(--color-text-tertiary)" fontSize="13">
        out of 100
      </text>
    </svg>
  );
}
