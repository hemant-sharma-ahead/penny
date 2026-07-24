// Web implementation of the profile-change notification bus (Track C prerequisite). Web's own
// `GroupContext.tsx` currently listens via a raw `window.addEventListener(PROFILE_UPDATED_EVENT, ...)`
// rather than `subscribeProfileChanged` — kept as-is (unchanged behavior) since it predates this file;
// new consumers (including the mobile port) should use `subscribeProfileChanged` instead of touching
// `window` directly.

export const PROFILE_UPDATED_EVENT = 'penny-profile-updated';

export function notifyProfileChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT));
}

/** Subscribe to profile-identity changes (claim/reclaim/handle change). Returns an unsubscribe function. */
export function subscribeProfileChanged(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  window.addEventListener(PROFILE_UPDATED_EVENT, handler);
  return () => window.removeEventListener(PROFILE_UPDATED_EVENT, handler);
}
