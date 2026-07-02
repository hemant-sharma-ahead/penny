// Aggregate a set of scored headlines into a descriptive "news mood". Pure, no AI.
// This is an OBSERVATION of how today's headlines skew — never a market forecast. The UI must
// label it "Informational only, not investment advice". See docs/MARKET_SENTIMENT_RESEARCH.md.

import type { ScoredHeadline, MoodSummary } from './types';

// If fewer than this share of headlines carry any sentiment, we call the day "quiet" rather than
// forcing a positive/negative read out of mostly-neutral news.
const QUIET_SIGNAL_SHARE = 0.2;
// Net lean (positive − negative) as a share of total needed to call a direction rather than "mixed".
const LEAN_SHARE = 0.1;

export function computeMood(scored: ScoredHeadline[]): MoodSummary {
  let positive = 0;
  let negative = 0;
  let neutral = 0;

  for (const s of scored) {
    if (s.label === 'positive') positive += 1;
    else if (s.label === 'negative') negative += 1;
    else neutral += 1;
  }

  const total = scored.length;
  const net = positive - negative;
  const signal = positive + negative;

  let skew: MoodSummary['skew'];
  let label: string;

  if (total === 0) {
    skew = 'quiet';
    label = 'No headlines yet';
  } else if (signal / total < QUIET_SIGNAL_SHARE) {
    skew = 'quiet';
    label = 'Quiet — mostly neutral';
  } else if (net / total >= LEAN_SHARE) {
    skew = 'positive';
    label = 'Leaning positive';
  } else if (-net / total >= LEAN_SHARE) {
    skew = 'negative';
    label = 'Leaning negative';
  } else {
    skew = 'mixed';
    label = 'Mixed';
  }

  return { positive, negative, neutral, total, net, skew, label };
}
