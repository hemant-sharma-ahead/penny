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

const COL = 54; // px per month column (chart scrolls horizontally)
const TOP = 18; // headroom for value labels
const PLOT = 78; // bar plot height
const BOTTOM = 18; // month-label row
const H = TOP + PLOT + BOTTOM;

/**
 * Annual combined chart: faint previous-year expense bars behind this year's
 * expense bars + an income line. Values sit above each bar (Open mode); columns
 * are tappable to open that month, and the chart scrolls horizontally.
 */
export function AnnualChart({ series, prevYear, max, mode, onSelectMonth }: Props) {
  const n = series.length;
  const W = n * COL;
  const open = mode === 'open';
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
    <div className="overflow-x-auto scrollbar-none -mx-1 px-1">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-label="Income vs expense by month">
        {series.map((p, i) => {
          const prev = prevYear[i];
          const center = cx(i);
          const tappable = !p.projected && (p.expense > 0 || p.income > 0);
          return (
            <g key={p.month}>
              {prev && prev.expense > 0 && (
                <rect
                  x={center - bw / 2 + bw * 0.2}
                  y={y(prev.expense)}
                  width={bw}
                  height={TOP + PLOT - y(prev.expense)}
                  rx={2}
                  fill="var(--color-text-tertiary)"
                  opacity={0.16}
                />
              )}
              <rect
                x={center - bw / 2}
                y={y(p.expense)}
                width={bw}
                height={TOP + PLOT - y(p.expense)}
                rx={2}
                fill="var(--color-primary)"
                opacity={p.projected ? 0.28 : 0.7}
              />
              {open && p.expense > 0 && (
                <text
                  x={center}
                  y={y(p.expense) - 4}
                  textAnchor="middle"
                  fontSize={8.5}
                  fill="var(--color-text-secondary)"
                >
                  {formatCompact(p.expense).replace('₹', '')}
                </text>
              )}
              <text x={center} y={H - 5} textAnchor="middle" fontSize={9} fill="var(--color-text-tertiary)">
                {p.label}
              </text>
              {/* Full-column tap target → open that month */}
              {tappable && (
                <rect
                  x={i * COL}
                  y={0}
                  width={COL}
                  height={H}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelectMonth(p.month)}
                />
              )}
            </g>
          );
        })}
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
            r={1.8}
            fill={STATUS.success}
            opacity={p.projected ? 0.5 : 1}
          />
        ))}
      </svg>

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
        <span className="opacity-70">· tap a month · faded = projected</span>
      </div>
    </div>
  );
}
