/**
 * The storage-engine seam (Track 2 of the mobile migration). `EncryptedRepository<T>` and the few
 * direct-access tables (`security`, `price_cache`, `privacy_stats`) only ever call these six methods —
 * verified against every call site in the codebase before narrowing this type. Dexie's `Table<T, string>`
 * (web) already structurally satisfies this interface, so narrowing `EncryptedRepository`'s constructor
 * param to `RowStore<T>` is a type-only change with zero behavior change on web. `schema.native.ts`'s
 * op-sqlite adapter (originally expo-sqlite, then MMKV, both replaced 2026-07-26 — see that file for the
 * full history) implements the same
 * interface so no caller (repositories.ts, securityManager.ts, priceCache.ts, etc.) needs to change.
 */
export interface RowStore<T> {
  get(id: string): Promise<T | undefined>;
  put(record: T): Promise<unknown>;
  toArray(): Promise<T[]>;
  delete(id: string): Promise<unknown>;
  count(): Promise<number>;
  update(id: string, changes: Partial<T>): Promise<unknown>;
  clear(): Promise<unknown>;
}
