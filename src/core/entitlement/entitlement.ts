// Pricing-readiness gate (Track 2).
//
// Route would-be-paid features through `hasEntitlement(feature)`. In Phase 1 this
// always returns true — everyone has full access until pricing ships. When pricing
// lands, this is the single place to swap the source (store receipts on native /
// offline-verifiable signed license tokens on web) WITHOUT touching feature code.

import type { Plan } from '@/core/db/types';

/** Features that may eventually sit behind a paid plan, or are gated until ready. */
export type Feature = 'cloud_backup' | 'sync';

// Phase 1: every shipped feature is free. This is the single place to flip a feature to paid later
// (then derive the answer from the stored plan / verified license token).
//
// `sync` is intentionally OFF here — it's READINESS-gated, not pricing-gated: account claim + the
// sync/groups UI stay dark until Track D delivers real sync value. Flip this to true to enable an
// opt-in beta / % canary. (Track C builds the claim flow behind this gate.)
const FREE_IN_PHASE_1: Record<Feature, boolean> = {
  cloud_backup: true,
  sync: false
};

/** Whether the current user may use a feature. */
export function hasEntitlement(feature: Feature): boolean {
  return FREE_IN_PHASE_1[feature];
}

/** The effective plan. Defaults to full access until pricing exists. */
export function effectivePlan(plan: Plan | undefined): Plan {
  return plan ?? 'free';
}
