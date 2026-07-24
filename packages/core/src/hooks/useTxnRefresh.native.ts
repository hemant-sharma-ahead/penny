import { useEffect } from 'react';

/**
 * RN variant of `useTxnRefresh.ts` — same exports/contract, no DOM. Web's version uses
 * `window.addEventListener`/`dispatchEvent`, which don't exist in React Native (no `window` Event
 * target). Metro resolves this `.native.ts` file over the plain `.ts` one for any native build (Vite has
 * no such convention and always resolves the plain file) — same pattern as `schema.native.ts`
 * (see docs/plans/mobile-migration.md's Track 2 entry). Replaces the DOM event with a plain in-memory
 * listener set.
 */
export const TXN_CHANGED_EVENT = 'penny:txn-changed';

const listeners = new Set<() => void>();

/** Broadcast that transactions changed so balance/forecast views in other hooks reload. */
export function notifyTxnChanged(): void {
  for (const listener of listeners) listener();
}

/**
 * Reload derived transaction data (balances, forecasts, lists) when another part of the app writes
 * transactions through a separate repo instance — e.g. the IOU screen creating a linked expense.
 * Pass a STABLE callback (useCallback).
 */
export function useTxnRefresh(reload: () => void): void {
  useEffect(() => {
    listeners.add(reload);
    return () => {
      listeners.delete(reload);
    };
  }, [reload]);
}
