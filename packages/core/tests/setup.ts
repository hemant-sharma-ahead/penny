import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';
import { invalidateAllRepositoryCaches } from '@/core/db/repositories';

// `EncryptedRepository` now caches its decrypted table in memory (2026-08-28 performance fix) — every
// repo is a module-level singleton, so that cache survives across tests in the same file. Individual
// test files reset state with direct `db.<table>.clear()` calls (bypassing every repo, same as this
// codebase's few legitimate production bypasses — see `invalidateAllRepositoryCaches()`'s own doc
// comment), which would otherwise leave a previous test's cached rows visible to the next test. One
// global `beforeEach` here covers every test file without needing to touch each one individually.
beforeEach(() => {
  invalidateAllRepositoryCaches();
});

// Minimal in-memory localStorage for the node test env (used by device-local settings / backup prefs).
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    }
  } as Storage;
}
