// In-memory keystore for the Master Key.
// The MK is NEVER written to disk — it lives only in this module's closure.
// On session expiry, lock() zeros out the reference so GC can collect it.

let masterKey: CryptoKey | null = null;

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
  }
};
