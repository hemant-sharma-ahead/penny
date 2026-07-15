import type { MoodSummary } from '@/core/sentiment';
import { STATUS, tint } from '@/lib/statusColors';

const SKEW_META: Record<MoodSummary['skew'], { color: string; icon: string }> = {
  positive: { color: STATUS.success, icon: 'ti-trending-up' },
  negative: { color: STATUS.danger, icon: 'ti-trending-down' },
  mixed: { color: STATUS.warning, icon: 'ti-arrows-up-down' },
  quiet: { color: STATUS.neutral, icon: 'ti-minus' }
};

/**
 * "Today's news mood" — a full-bleed banner fixed under the page header (not part of the scrolling
 * feed), so it's glanceable even while headlines scroll. Descriptive only — how the current headlines
 * skew (positive/negative/mixed) — NOT a market forecast or investment advice. The disclaimer below is
 * mandatory and must stay persistent (not hidden behind a tap). See docs/MARKET_SENTIMENT_RESEARCH.md §9.
 */
export function NewsMoodGauge({ mood }: { mood: MoodSummary }) {
  const { color, icon } = SKEW_META[mood.skew];
  const { positive, negative, neutral, total } = mood;

  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <div className="flex-shrink-0">
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b"
        style={{ backgroundColor: tint(color, 10), borderColor: tint(color, 25) }}
      >
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: tint(color, 20) }}
        >
          <i className={`ti ${icon}`} style={{ fontSize: 18, color }} aria-hidden="true" />
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight truncate" style={{ color }}>
            {mood.label}
          </p>
          {total > 0 && (
            <p className="text-[10px] text-secondary mt-0.5">
              {positive} pos · {neutral} neutral · {negative} neg
            </p>
          )}
        </div>

        {total > 0 && (
          <div className="flex h-1.5 w-11 overflow-hidden rounded-full flex-shrink-0" aria-hidden="true">
            <div style={{ width: `${pct(positive)}%`, backgroundColor: STATUS.success }} />
            <div style={{ width: `${pct(neutral)}%`, backgroundColor: STATUS.neutral }} />
            <div style={{ width: `${pct(negative)}%`, backgroundColor: STATUS.danger }} />
          </div>
        )}

        <div className="text-right flex-shrink-0">
          <p className="text-base font-extrabold text-primary leading-tight">{total}</p>
          <p className="text-[8.5px] text-tertiary leading-tight">headlines</p>
        </div>
      </div>

      <p className="text-[9px] text-tertiary leading-tight px-4 py-1 border-b border-theme">
        Informational only — a summary of news tone, not investment advice or a market prediction.
      </p>
    </div>
  );
}
