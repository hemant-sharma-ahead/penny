import { useEffect } from 'react';

/** The app-wide signal that transactions/balances changed in another mounted hook instance. */
export const TXN_CHANGED_EVENT = 'penny:txn-changed';

/** Broadcast that transactions changed so balance/forecast views in other hooks reload. */
export function notifyTxnChanged(): void {
  window.dispatchEvent(new Event(TXN_CHANGED_EVENT));
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
