interface ProgressBarProps {
  /** 0–100 */
  value: number;
  /** CSS color value. Defaults to --color-primary. */
  color?: string;
  /** Track height. Defaults to 'sm' (h-1.5). */
  size?: 'xs' | 'sm' | 'md';
  /** Animate the fill width on mount */
  animate?: boolean;
}

const HEIGHT = { xs: 'h-1', sm: 'h-1.5', md: 'h-2.5' } as const;

export function ProgressBar({ value, color = 'var(--color-primary)', size = 'sm', animate = false }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value));

  return (
    <div className={`w-full ${HEIGHT[size]} rounded-full bg-surface-3`}>
      <div
        className={`${HEIGHT[size]} rounded-full ${animate ? 'transition-all duration-500' : ''}`}
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}
