// Shared RN implementation for entitlement.native.ts and entitlement.web.ts. Both need to exist as
// separate files so Metro's platform resolution picks one of them (over the bare entitlement.ts, which
// reads Vite's `import.meta.env` — a global Metro never defines) for every RN target (iOS/Android/web),
// but their actual logic is identical, so it lives here once per the platform-variance-minimization
// principle (docs/ARCHITECTURE.md) — see apiBase.constants.ts for the same pattern.

import type { Plan } from '@/core/db/types';
import Constants from 'expo-constants';

export type Feature = 'cloud_backup' | 'sync';

const SYNC_ENABLED = Constants.expoConfig?.extra?.enableSync === true;

const FREE_IN_PHASE_1: Record<Feature, boolean> = {
  cloud_backup: true,
  sync: SYNC_ENABLED
};

export function hasEntitlement(feature: Feature): boolean {
  return FREE_IN_PHASE_1[feature];
}

export function effectivePlan(plan: Plan | undefined): Plan {
  return plan ?? 'free';
}
