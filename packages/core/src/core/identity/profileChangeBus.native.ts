// RN counterpart to profileChangeBus.ts — same "no window" fix pattern as useTxnRefresh.native.ts/
// useDataRefresh.native.ts: a plain in-memory listener Set instead of a DOM CustomEvent.

export const PROFILE_UPDATED_EVENT = 'penny-profile-updated';

const listeners = new Set<() => void>();

export function notifyProfileChanged(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to profile-identity changes (claim/reclaim/handle change). Returns an unsubscribe function. */
export function subscribeProfileChanged(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
