import { useEffect } from 'react';
import { TXN_CHANGED_EVENT } from './useTxnRefresh.constants';

export { TXN_CHANGED_EVENT };

let flushScheduled = false;

/** Broadcast that transactions changed so balance/forecast views in other hooks reload. Coalesced onto
 *  a microtask — see `useTxnRefresh.native.ts`'s matching doc comment for why. */
export function notifyTxnChanged(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    window.dispatchEvent(new Event(TXN_CHANGED_EVENT));
  });
}

/**
 * Reload derived transaction data (balances, forecasts, lists) when another part of the app writes
 * transactions through a separate repo instance — e.g. the IOU screen creating a linked expense.
 * Pass a STABLE callback (useCallback).
 */
export function useTxnRefresh(reload: () => void): void {
  useEffect(() => {
    window.addEventListener(TXN_CHANGED_EVENT, reload);
    return () => window.removeEventListener(TXN_CHANGED_EVENT, reload);
  }, [reload]);
}
