import type { MoodSummary } from '@/core/sentiment';
import { STATUS, tint } from '@/lib/statusColors';

const SKEW_META: Record<MoodSummary['skew'], { color: string; icon: string }> = {
  positive: { color: STATUS.success, icon: 'ti-trending-up' },
  negative: { color: STATUS.danger, icon: 'ti-trending-down' },
  mixed: { color: STATUS.warning, icon: 'ti-arrows-up-down' },
  quiet: { color: STATUS.neutral, icon: 'ti-minus' }
};

/**
 * Descriptive "today's news mood" card — how the current headlines skew (positive/negative/mixed).
 * This is an OBSERVATION of the news, NOT a market forecast or investment advice. The disclaimer
 * below is mandatory. See docs/MARKET_SENTIMENT_RESEARCH.md §9.
 */
export function NewsMoodGauge({ mood }: { mood: MoodSummary }) {
  const { color, icon } = SKEW_META[mood.skew];
  const { positive, negative, neutral, total } = mood;

  // Proportional bar segments (guard against divide-by-zero).
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <div className="surface rounded-2xl p-4 flex flex-col gap-3">
      <span className="text-xs font-medium text-secondary">Today's news mood</span>

      {/* Hero lean — icon badge + headline label */}
      <div className="flex items-center gap-3">
        <span
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: tint(color) }}
        >
          <i className={`ti ${icon}`} style={{ fontSize: 22, color }} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xl font-semibold leading-tight" style={{ color }}>
            {mood.label}
          </p>
          {total > 0 && (
            <p className="text-[11px] text-tertiary mt-0.5">
              across {total} {total === 1 ? 'headline' : 'headlines'} today
            </p>
          )}
        </div>
      </div>

      {/* Proportional bar: positive / neutral / negative */}
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <div style={{ width: `${pct(positive)}%`, backgroundColor: STATUS.success }} />
        <div style={{ width: `${pct(neutral)}%`, backgroundColor: STATUS.neutral }} />
        <div style={{ width: `${pct(negative)}%`, backgroundColor: STATUS.danger }} />
      </div>

      <div className="flex items-center justify-between text-[11px] text-secondary">
        <span>{positive} positive</span>
        <span>{neutral} neutral</span>
        <span>{negative} negative</span>
      </div>

      <p className="text-[10px] text-tertiary leading-tight">
        Informational only — a summary of news tone, not investment advice or a market prediction.
      </p>
    </div>
  );
}
