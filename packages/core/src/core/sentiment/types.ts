// Types for the on-device, no-AI news sentiment engine (Phase A).
// See docs/MARKET_SENTIMENT_RESEARCH.md. Everything here is descriptive/informational only —
// never a recommendation, prediction, or price target.

export type SentimentLabel = 'positive' | 'negative' | 'neutral';

/** A single lexicon word that contributed to a headline's score (for the explainable "why" popover). */
export interface MatchedTerm {
  term: string;
  polarity: 'positive' | 'negative';
  /** Signed contribution after negation/intensifier handling. */
  weight: number;
}

/** The result of scoring one headline. Pure output of `scoreHeadline`. */
export interface ScoredHeadline {
  /** Net signed score. > 0 leans positive, < 0 negative, 0 neutral. */
  score: number;
  label: SentimentLabel;
  matched: MatchedTerm[];
}

/** Aggregate "news mood" over a set of scored headlines. Descriptive, NOT a forecast. */
export interface MoodSummary {
  positive: number;
  negative: number;
  neutral: number;
  total: number;
  /** Net = positive − negative, for a quick lean read. */
  net: number;
  skew: 'positive' | 'negative' | 'mixed' | 'quiet';
  /** Short human label, e.g. "Leaning negative". */
  label: string;
}
