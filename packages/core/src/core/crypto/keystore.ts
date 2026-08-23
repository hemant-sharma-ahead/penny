// In-memory keystore for the Master Key.
// The MK is NEVER written to disk — it lives only in this module's closure.
// On session expiry, lock() zeros out the reference so GC can collect it.

let masterKey: CryptoKey | null = null;

// 2026-08-21, real-device testing feedback: after a restore, `importBackup()` calls `lockSession()`
// directly (the DMK is cleared immediately), but the screen kept showing normal, fully-interactive UI
// for up to ~60s afterward — `SessionGate.tsx`'s only way of finding out a lock happened was
// `sessionStore.ts`'s periodic inactivity-timeout poll (every 60s), which has nothing to do with, and
// no reason to react promptly to, a lock that happened for a completely different reason elsewhere.
// This listener set lets ANY `lock()` call (restore, background-lock, a future caller) notify
// immediately, without changing what triggers a lock in the first place — `sessionStore`'s poll is
// untouched and still does its own job (detecting elapsed inactivity, which is genuinely time-based
// and has no other event to hook).
const lockListeners = new Set<() => void>();

export const keystore = {
  setMasterKey(key: CryptoKey): void {
    masterKey = key;
  },

  getMasterKey(): CryptoKey {
    if (!masterKey) {
      throw new Error('Session locked — master key not available');
    }
    return masterKey;
  },

  isUnlocked(): boolean {
    return masterKey !== null;
  },

  lock(): void {
    masterKey = null;
    for (const listener of lockListeners) listener();
  },

  /** Notified synchronously, immediately, every time `lock()` runs — regardless of why. Returns an
   *  unsubscribe function. */
  onLock(listener: () => void): () => void {
    lockListeners.add(listener);
    return () => lockListeners.delete(listener);
  }
};
