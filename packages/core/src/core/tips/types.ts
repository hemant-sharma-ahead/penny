// "Did You Know" tips (2026-08-16) — shared types for the content library. See
// docs/features/did-you-know-tips.md for the full design (three delivery tiers, one library).

export type TipModule =
  | 'transactions'
  | 'categories'
  | 'tags'
  | 'events'
  | 'iou'
  | 'import'
  | 'analytics'
  | 'budgets'
  | 'backup'
  | 'timeline'
  | 'privacy'
  | 'portfolio'
  | 'goals'
  | 'chip'
  | 'groups'
  | 'onboarding'
  | 'tax';

export interface DidYouKnowFact {
  id: string;
  module: TipModule;
  text: string;
  /** True for the ~39 hand-curated, highest-impact facts — the ONLY ones Tier 1 (contextual nudges) and
   *  Tier 2 (the rotating/daily card) ever draw from. False for the rest of the research catalogue,
   *  which is only ever shown in the Tier 3 "Discover Penny" hub (fully browsable, never pushed). */
  curated: boolean;
}
