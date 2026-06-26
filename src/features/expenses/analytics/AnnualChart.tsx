import { formatCompact } from '@/lib/formatters';
import { STATUS } from '@/lib/statusColors';
import type { MonthPoint } from '@/core/expenses/annualAnalytics';

interface Props {
  series: MonthPoint[]; // 12 months, this year
  prevYear: MonthPoint[]; // 12 months, last year (for ghost bars)
  max: number;
  mode: 'open' | 'safe' | 'privacy';
  onSelectMonth: (month: string) => void;
}

const W = 360;
const H = 96; // plot height

/**
 * Annual combined chart: faint previous-year expense bars behind this year's
 * expense bars, with an income line overlaid. Projected (future) months render
 * lighter with a dashed income segment.
 */
export function AnnualChart({ series, prevYear, max, mode, onSelectMonth }: Props) {
  const n = series.length;
  const slot = W / n;
  const bw = slot * 0.42;
  const y = (v: number) => H - (Math.max(0, v) / max) * H;
  const cx = (i: number) => i * slot + slot / 2;

  const firstProjected = series.findIndex((p) => p.projected);
  const actualPts = series.filter((p) => !p.projected).map((p, i) => `${cx(i).toFixed(1)},${y(p.income).toFixed(1)}`);
  // Dashed segment links the last actual month into the projected tail.
  const projStart = firstProjected === -1 ? n : firstProjected;
  const projPts = series
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i >= projStart - 1 && projStart > 0)
    .map(({ p, i }) => `${cx(i).toFixed(1)},${y(p.income).toFixed(1)}`);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 4}`} width="100%" height={H + 4} aria-label="Income vs expense by month">
        {/* Bars */}
        {series.map((p, i) => {
          const prev = prevYear[i];
          const center = cx(i);
          return (
            <g key={p.month}>
              {/* Last-year ghost expense bar */}
              {prev && prev.expense > 0 && (
                <rect
                  x={center - bw / 2 + bw * 0.18}
                  y={y(prev.expense)}
                  width={bw}
                  height={H - y(prev.expense)}
                  rx={1.5}
                  fill="var(--color-text-tertiary)"
                  opacity={0.16}
                />
              )}
              {/* This-year expense bar */}
              <rect
                x={center - bw / 2}
                y={y(p.expense)}
                width={bw}
                height={H - y(p.expense)}
                rx={1.5}
                fill="var(--color-primary)"
                opacity={p.projected ? 0.28 : 0.7}
              />
            </g>
          );
        })}
        {/* Income line — solid (actual) + dashed (projected) */}
        {actualPts.length > 1 && (
          <polyline
            points={actualPts.join(' ')}
            fill="none"
            stroke={STATUS.success}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}
        {projPts.length > 1 && (
          <polyline
            points={projPts.join(' ')}
            fill="none"
            stroke={STATUS.success}
            strokeWidth={2}
            strokeDasharray="4 3"
            opacity={0.7}
          />
        )}
        {series.map((p, i) => (
          <circle
            key={`d-${p.month}`}
            cx={cx(i)}
            cy={y(p.income)}
            r={1.6}
            fill={STATUS.success}
            opacity={p.projected ? 0.5 : 1}
          />
        ))}
      </svg>

      {/* Month labels (tappable → drill into the month) */}
      <div className="flex">
        {series.map((p) => (
          <button
            key={p.month}
            onClick={() => onSelectMonth(p.month)}
            disabled={p.projected || (p.expense === 0 && p.income === 0)}
            className="flex-1 text-[9px] text-tertiary disabled:cursor-default"
            title={
              mode === 'open'
                ? `${p.label}: spend ${formatCompact(p.expense)} · income ${formatCompact(p.income)}`
                : undefined
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 mt-2 text-[10px] text-tertiary">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'var(--color-primary)', opacity: 0.7 }} />
          Expense
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 rounded" style={{ backgroundColor: STATUS.success }} />
          Income
        </span>
        <span className="flex items-center gap-1">
          <span
            className="w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: 'var(--color-text-tertiary)', opacity: 0.16 }}
          />
          Last year
        </span>
        <span className="opacity-70">· faded = projected</span>
      </div>
    </div>
  );
}
