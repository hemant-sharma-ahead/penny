// Barrel for the on-device, no-AI news sentiment engine (Phase A + Phase B).
// Descriptive/informational only — never a recommendation or forecast.

export { tokenize } from './normalize';
export { scoreHeadline } from './scoreHeadline';
export { computeMood } from './aggregate';
export { tagEntities } from './tagEntities';
export { ENTITIES } from './entityDictionary';
export type { EntityMatch } from './tagEntities';
export type { EntityEntry } from './entityDictionary';
export type { SentimentLabel, ScoredHeadline, MatchedTerm, MoodSummary } from './types';
