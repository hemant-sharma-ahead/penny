// Shared across useTxnRefresh.ts (web) and useTxnRefresh.native.ts — kept in exactly one place per
// the platform-variance-minimization principle (docs/ARCHITECTURE.md).
export const TXN_CHANGED_EVENT = 'penny:txn-changed';
