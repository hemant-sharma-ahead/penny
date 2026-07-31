import type { ScoredHeadline, SentimentLabel } from '@/core/sentiment';
import { STATUS } from '@/lib/statusColors';
import type { HoldingNewsMatch } from './useHoldingsInNews';

function relativeTime(epochMs: number): string {
  const mins = Math.floor((Date.now() - epochMs) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TONE: Record<SentimentLabel, { color: string; icon: string; text: string }> = {
  positive: { color: STATUS.success, icon: 'ti-trending-up', text: 'Positive' },
  negative: { color: STATUS.danger, icon: 'ti-trending-down', text: 'Negative' },
  neutral: { color: 'var(--color-text-secondary)', icon: 'ti-minus', text: 'Neutral' }
};

interface Props {
  matches: HoldingNewsMatch[];
  scoredById: Map<string, ScoredHeadline>;
}

/**
 * "Holdings News" tab content — headlines mentioning stocks the user owns, recency-ordered, each with
 * the headline's own sentiment tone. Filtering (source/tone/which holding) is controlled by the
 * dropdowns in NewsPage; this component only renders the resulting list. Informational (news about
 * what you own), NOT a trade idea or ranking of picks. See docs/MARKET_SENTIMENT_RESEARCH.md §F3.
 */
export function HoldingsInNews({ matches, scoredById }: Props) {
  if (matches.length === 0) {
    return (
      <div className="surface rounded-2xl p-4 flex items-center gap-3">
        <i className="ti ti-mood-neutral text-tertiary" style={{ fontSize: 20 }} aria-hidden="true" />
        <div>
          <p className="text-sm text-secondary">None of your holdings are in today's news.</p>
          <p className="text-[11px] text-tertiary mt-0.5">
            We'll surface headlines here when they mention a stock you own.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {matches.map(({ item, holdings }) => {
          const tone = TONE[scoredById.get(item.id)?.label ?? 'neutral'];
          return (
            <a
              key={item.id}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="surface rounded-2xl p-3 flex flex-col gap-1.5 active:opacity-70 transition-opacity no-underline"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  {holdings.map((h) => (
                    <span
                      key={h.symbol}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-2 text-secondary"
                    >
                      {h.symbol}
                    </span>
                  ))}
                </div>
                <span className="flex items-center gap-1 flex-shrink-0 text-[10px]">
                  <i className={`ti ${tone.icon}`} style={{ fontSize: 12, color: tone.color }} aria-hidden="true" />
                  <span style={{ color: tone.color }} className="font-medium">
                    {tone.text}
                  </span>
                  <span className="text-tertiary">· {relativeTime(item.publishedAt)}</span>
                </span>
              </div>
              <p className="text-sm font-medium text-primary leading-snug line-clamp-2">{item.title}</p>
            </a>
          );
        })}
      </div>

      <p className="text-[10px] text-tertiary leading-tight mt-2">
        News mentioning stocks you own — informational only, not investment advice or a recommendation.
      </p>
    </>
  );
}
