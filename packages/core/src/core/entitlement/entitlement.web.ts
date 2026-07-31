// Metro-web counterpart to entitlement.ts. `apps/mobile` targets iOS/Android/web (react-native-web);
// Metro's platform resolution only picks `.native.ts` for iOS/Android, not for the `web` target, so
// without this file Metro falls through to the bare `entitlement.ts` — which reads Vite's
// `import.meta.env.VITE_ENABLE_SYNC`, a global Metro never defines (crashes with "Cannot read
// properties of undefined (reading 'VITE_ENABLE_SYNC')"). Real logic lives in entitlement.constants.ts
// (shared with entitlement.native.ts, which needs the exact same override for the same reason).

export { type Feature, hasEntitlement, effectivePlan } from './entitlement.constants';
