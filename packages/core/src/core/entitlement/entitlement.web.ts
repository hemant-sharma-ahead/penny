// Metro-web counterpart to entitlement.ts. `apps/mobile` targets iOS/Android/web (react-native-web);
// Metro's platform resolution only picks `.native.ts` for iOS/Android, not for the `web` target, so
// without this file Metro falls through to the bare `entitlement.ts` — which reads Vite's
// `import.meta.env.VITE_ENABLE_SYNC`, a global Metro never defines (crashes with "Cannot read
// properties of undefined (reading 'VITE_ENABLE_SYNC')"). Same `expo-constants`/`app.json` `extra`
// mechanism as `entitlement.native.ts` — `Constants.expoConfig` is populated identically under Expo's
// web target, so this is a straight duplicate, not a different implementation.

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
