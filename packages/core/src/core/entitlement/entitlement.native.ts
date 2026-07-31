// RN/Metro counterpart to entitlement.ts: Vite injects `import.meta.env.VITE_ENABLE_SYNC` at build
// time, but Metro/Hermes has no such global. Real logic lives in entitlement.constants.ts (shared with
// entitlement.web.ts, which needs the exact same override for the same reason).

export { type Feature, hasEntitlement, effectivePlan } from './entitlement.constants';
