import { DidYouKnowCard } from '~/components/shared';

/**
 * RN port of apps/web-react/src/features/tax/DidYouKnow.tsx — thin wrapper over the shared, generalized
 * `DidYouKnowCard` (2026-08-16), scoped to Tax's own fact set via `module="tax"`. No `onSeeAll` here —
 * Tax already has its own dedicated fact list; there's nothing else module-specific to point to.
 * `apps/web-react` is frozen, so its own copy of this file (and `taxFacts.ts`'s consumption there) is
 * untouched — this generalization is mobile-only.
 */
export function DidYouKnow() {
  return <DidYouKnowCard module="tax" />;
}
