import type { SentimentLabel } from '@/core/sentiment';
import { STATUS, tint, ink } from '@/lib/statusColors';

const META: Record<SentimentLabel, { color: string; icon: string; text: string }> = {
  positive: { color: STATUS.success, icon: 'ti-trending-up', text: 'Positive' },
  negative: { color: STATUS.danger, icon: 'ti-trending-down', text: 'Negative' },
  neutral: { color: STATUS.neutral, icon: 'ti-minus', text: 'Neutral' }
};

/**
 * Small pill showing a headline's news-tone (positive/negative/neutral). Descriptive only —
 * NOT a buy/sell signal or price prediction. See docs/MARKET_SENTIMENT_RESEARCH.md.
 */
export function SentimentChip({ label }: { label: SentimentLabel }) {
  const m = META[label];
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: tint(m.color), color: ink(m.color) }}
    >
      <i className={`ti ${m.icon}`} style={{ fontSize: 11 }} aria-hidden="true" />
      {m.text}
    </span>
  );
}
