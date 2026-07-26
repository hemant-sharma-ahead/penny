// Shared across profileChangeBus.ts (web) and profileChangeBus.native.ts — kept in exactly one place
// per the platform-variance-minimization principle (docs/ARCHITECTURE.md).
export const PROFILE_UPDATED_EVENT = 'penny-profile-updated';
