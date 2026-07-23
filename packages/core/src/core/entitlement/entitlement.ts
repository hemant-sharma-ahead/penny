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
// `sync` is the **Phase 1.5 launch switch** — it gates the account-claim offer (and everything that
// depends on a claimed account: backup-sync + Groups). It's READINESS-gated, not pricing-gated, and is
// controlled by an env flag so it can be shipped OFF and turned on per-deploy without a code change:
//   VITE_ENABLE_SYNC=1  → Phase 1.5 on (claim offer appears; claimed users get Groups)
//   unset / anything else → Phase 1 only (fully on-device, no backend)
// (Groups themselves additionally require a claimed username — see the claim flow / GroupContext.)
const SYNC_ENABLED = import.meta.env.VITE_ENABLE_SYNC === '1' || import.meta.env.VITE_ENABLE_SYNC === 'true';

const FREE_IN_PHASE_1: Record<Feature, boolean> = {
  cloud_backup: true,
  sync: SYNC_ENABLED
};

/** Whether the current user may use a feature. */
export function hasEntitlement(feature: Feature): boolean {
  return FREE_IN_PHASE_1[feature];
}

/** The effective plan. Defaults to full access until pricing exists. */
export function effectivePlan(plan: Plan | undefined): Plan {
  return plan ?? 'free';
}
