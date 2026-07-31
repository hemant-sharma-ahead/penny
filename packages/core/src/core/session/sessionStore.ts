// Session state outside of React — used by the inactivity timer and session gate.
// Keeps a last-activity timestamp and manages the auto-lock interval.

import { isSessionValid, lockSession, refreshSession } from '@/core/crypto/securityManager';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const TICK_INTERVAL_MS = 60 * 1000; // check every 60s

let tickInterval: ReturnType<typeof setInterval> | null = null;
let onLockCallback: (() => void) | null = null;

export function recordActivity(): void {
  void refreshSession();
}

export function startSessionWatcher(onLock: () => void): void {
  onLockCallback = onLock;
  if (tickInterval) return;

  tickInterval = setInterval(async () => {
    const valid = await isSessionValid();
    if (!valid) {
      stopSessionWatcher();
      lockSession();
      onLockCallback?.();
    }
  }, TICK_INTERVAL_MS);
}

export function stopSessionWatcher(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

export { INACTIVITY_TIMEOUT_MS };
