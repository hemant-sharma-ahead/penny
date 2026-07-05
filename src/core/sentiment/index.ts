// Barrel for the on-device, no-AI news sentiment engine (Phase A).
// Descriptive/informational only — never a recommendation or forecast.

export { tokenize } from './normalize';
export { scoreHeadline } from './scoreHeadline';
export { computeMood } from './aggregate';
export type { SentimentLabel, ScoredHeadline, MatchedTerm, MoodSummary } from './types';
