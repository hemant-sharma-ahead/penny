// RN/Metro counterpart to entitlement.ts: Vite injects `import.meta.env.VITE_ENABLE_SYNC` at build
// time, but Metro/Hermes has no such global. Same `expo-constants`/`app.json`'s `extra` mechanism used
// by `apiBase.native.ts` for the Track C worker URLs.

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
