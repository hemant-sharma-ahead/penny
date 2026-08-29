import { useEffect } from 'react';
import { TXN_CHANGED_EVENT } from './useTxnRefresh.constants';

/**
 * RN variant of `useTxnRefresh.ts` — same exports/contract, no DOM. Web's version uses
 * `window.addEventListener`/`dispatchEvent`, which don't exist in React Native (no `window` Event
 * target). Metro resolves this `.native.ts` file over the plain `.ts` one for any native build (Vite has
 * no such convention and always resolves the plain file) — same pattern as `schema.native.ts`
 * (see docs/plans/mobile-migration.md's Track 2 entry). Replaces the DOM event with a plain in-memory
 * listener set.
 */
export { TXN_CHANGED_EVENT };

const listeners = new Set<() => void>();
let flushScheduled = false;

/**
 * Broadcast that transactions changed so balance/forecast views in other hooks reload. Coalesced onto
 * a microtask (2026-08-28) — several call sites in the same write can each call this once in a tight
 * sequence (e.g. a bulk mutation's own call plus a caller's), and every listener here now reads from
 * `EncryptedRepository`'s own in-memory cache (`repository.ts`) rather than re-decrypting, so a burst
 * of calls within the same tick collapsing into one flush avoids firing every listener N times over
 * for what's really one logical change, at zero cost to correctness — `queueMicrotask` still runs
 * before the next paint, so this stays imperceptible from a "did it refresh" standpoint.
 */
export function notifyTxnChanged(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    for (const listener of listeners) listener();
  });
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
