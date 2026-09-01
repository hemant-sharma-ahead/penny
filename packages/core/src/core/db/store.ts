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

/**
 * `expenses`-only row shape (Tier 2 performance fix, 2026-08-28 — see docs/ARCHITECTURE.md's matching
 * decision-log entry). Every other encrypted table stores just `id`/`iv`/`ciphertext` — no field but
 * `id` can ever be filtered/sorted on, since everything else is opaque ciphertext, so every read of
 * any size means "decrypt the whole table, then filter in JS." `expenses` is the one table with real
 * row-count pressure (10k+ on a real device), so it also carries 5 plaintext, indexed columns
 * mirroring `Expense`'s own `date`/`accountId`/`toAccountId`/`categoryId`/`type` — deliberately just
 * these 5 structural, opaque-id/timestamp fields, never amount/description/hashtags/notes, which stay
 * inside `ciphertext` exactly as before.
 */
export interface IndexedExpenseRow {
  id: string;
  iv: string;
  ciphertext: string;
  date?: number;
  accountId?: string;
  toAccountId?: string;
  categoryId?: string;
  type?: string;
}

/** `expenses`-only extension of `RowStore` — real indexed queries backed by the 5 columns above,
 *  returning just the matching encrypted rows for the caller to decrypt. `EncryptedRepository` falls
 *  back to a plain `getAll()` + JS filter for every other table (no such index exists there) — see
 *  its own `queryByDateRange`/`queryByAccount`/`queryByCategory` doc comments. Implemented by
 *  `schema.native.ts`'s `makeExpensesRowStore()` (real SQL) and `schema.ts`'s Dexie counterpart of
 *  the same name (real `.where(...)` queries) — same dual-implementation contract as `restoreTables`. */
export interface ExpenseRowStore extends RowStore<IndexedExpenseRow> {
  queryByDateRange(startMs: number, endMs: number): Promise<IndexedExpenseRow[]>;
  queryByAccount(accountId: string): Promise<IndexedExpenseRow[]>;
  queryByCategory(categoryId: string): Promise<IndexedExpenseRow[]>;
  /** Used only by the one-time index backfill (`useExpenses.ts`, flag `penny_expense_index_v1`) —
   *  writes just the 5 index columns for every already-encrypted row in ONE batch, without touching
   *  `iv`/`ciphertext` (no re-encryption needed, since the underlying records themselves didn't
   *  change). Batched rather than one call per row — found 2026-08-28, real-device testing: an
   *  unbatched `Promise.all` of ~10,000 individual autocommit updates cost a real, measurable ~2s
   *  main-thread stall on its one-time run, each row-store implementation's own single-transaction
   *  primitive (`executeBatch()` native, `db.transaction()` Dexie) cuts that down to one round-trip. */
  backfillIndexColumnsBatch(
    entries: Array<{
      id: string;
      fields: { date: number; accountId?: string; toAccountId?: string; categoryId: string; type: string };
    }>
  ): Promise<void>;
}
