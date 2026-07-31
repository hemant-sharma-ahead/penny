// Tiny in-memory signal so onboarding screens (SetupCredentialsScreen/DemoVaultScreen/
// AccountRecoveryScreen) can tell AuthGuard to re-run its checking → needs_onboarding/ready
// state machine once a vault has just been created or restored.
//
// Web's AuthGuard never needed this: onboarding screens either `navigate()` to a route inside
// AppShell's own AuthGuard-gated subtree (which re-runs on every render) or do a full
// `window.location.href` reload. Neither exists on mobile — AuthGuard's check only ever runs once,
// in a `useEffect` with an empty dependency array, on mount. This bus is the RN-native substitute:
// the same "no window" fix shape as `profileChangeBus.native.ts`, purpose-built for this one seam.
const listeners = new Set<() => void>();

export function notifyAuthShouldRecheck(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to "please re-run the onboarding/session check". Returns an unsubscribe function. */
export function subscribeAuthRecheck(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
