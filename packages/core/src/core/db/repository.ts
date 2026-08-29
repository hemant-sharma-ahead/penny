import type { ExpenseRowStore, RowStore } from './store';
import { decrypt, encrypt } from '@/core/crypto/engine';
import { keystore } from '@/core/crypto/keystore';

// All records stored in encrypted tables have this shape on disk.
interface EncryptedRecord {
  id: string;
  iv: string; // base64
  ciphertext: string; // base64
}

/** The 5 plaintext index columns `ExpenseRowStore` persists — see that interface's own doc comment
 *  (`store.ts`) for why only these 5 fields, never anything else on `Expense`. */
export interface ExpenseIndexFields {
  date: number;
  accountId?: string;
  toAccountId?: string;
  categoryId: string;
  type: string;
}

/** Passed only to `expensesRepo`'s construction (`repositories.ts`) — every other repo omits this and
 *  falls back to a plain `getAll()` + JS filter inside `queryByDateRange`/`queryByAccount`/
 *  `queryByCategory` below, which stays correct for any table, just without the fast path. */
export interface IndexedRepositoryOptions<T> {
  table: ExpenseRowStore;
  fields: (record: T) => ExpenseIndexFields;
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Chunked rather than `btoa(String.fromCharCode(...bytes))` — spreading (or `.apply`-ing) an entire
// large byte array as individual function arguments blows the JS call stack once it's big enough
// (confirmed on-device: a ~9,000-row CSV import's activity-log entry, encrypted as one record, threw
// "Maximum call stack size exceeded" here). 32768 (0x8000) is comfortably under every engine's
// argument-count ceiling, so this scales to any payload size.
const BASE64_CHUNK_SIZE = 0x8000;

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
}

export class EncryptedRepository<T extends { id: string }> {
  private table: RowStore<EncryptedRecord>;

  // In-memory cache of the fully-decrypted table (2026-08-28, real-device performance fix — see
  // docs/ARCHITECTURE.md's matching decision-log entry). `RowStore` can only do `get(id)` or a full
  // `toArray()` — every domain field except `id` is opaque AES-GCM ciphertext, so SQLite/Dexie can
  // never filter or sort by date/account/category/etc. That means every "query" the app makes (this
  // month's transactions, this account's ledger, ...) already meant "decrypt the ENTIRE table, then
  // filter in JS" — and with no cache, up to a dozen independently-mounted hooks each did that same
  // full decrypt redundantly on every screen load, and (via `notifyTxnChanged`'s ~14 subscribers) on
  // every single write anywhere in the app. Traced on a real device to a single transaction edit
  // costing ~20 seconds of main-thread block (`Skipped 2062 frames!` in logcat, one continuous
  // Choreographer stall) at ~10,000 transactions.
  //
  // `cache`/`inFlight` are keyed on this one repository instance — safe because every repo
  // (`expensesRepo`, `accountsRepo`, ...) is a true module-level singleton (`repositories.ts`),
  // constructed exactly once and imported everywhere, so this cache is naturally shared by every
  // caller without any of them needing to change.
  //
  // Invalidation: `put()`/`delete()` keep the cache consistent by patching it (never mutating the
  // existing array in place — always reassigning to a NEW array reference, since plenty of code in
  // this app keys a `useMemo`/`useEffect`/`useState` off that same array's identity and would silently
  // see stale data if the reference never changed). The only paths that write to a table WITHOUT going
  // through this class (`wipeAllData()`/`wipeDemoData()`'s raw `RowStore.clear()`, and backup's
  // `restoreTables()`/`mergeBundle()`, both raw batch writes) call `invalidateAllRepositoryCaches()`
  // (`repositories.ts`) immediately after — audited as the only 4 such bypasses in the codebase at the
  // time this was added.
  private cache: T[] | null = null;
  private inFlight: Promise<T[]> | null = null;

  // Tier 2 performance fix (2026-08-28, same decision-log entry as the cache above) — only ever set
  // for `expensesRepo`. When present, `put()` also derives and persists the 5 plaintext index columns
  // `ExpenseRowStore` understands, and `queryByDateRange`/`queryByAccount`/`queryByCategory` use a
  // real indexed query (decrypt only the matches) instead of `getAll()` + a JS filter over everything.
  private indexed: IndexedRepositoryOptions<T> | undefined;

  constructor(table: RowStore<EncryptedRecord>, indexed?: IndexedRepositoryOptions<T>) {
    this.table = table;
    this.indexed = indexed;
  }

  async put(record: T): Promise<void> {
    const mk = keystore.getMasterKey();
    const plaintext = new TextEncoder().encode(JSON.stringify(record));
    const { iv, ciphertext } = await encrypt(mk, plaintext);
    const base = { id: record.id, iv: bufferToBase64(iv), ciphertext: bufferToBase64(ciphertext) };
    const indexed = this.indexed;
    await this.table.put(indexed ? { ...base, ...indexed.fields(record) } : base);
    if (this.cache) {
      const idx = this.cache.findIndex((r) => r.id === record.id);
      this.cache = idx >= 0 ? this.cache.map((r, i) => (i === idx ? record : r)) : [...this.cache, record];
    }
  }

  async get(id: string): Promise<T | undefined> {
    if (this.cache) return this.cache.find((r) => r.id === id);
    const row = await this.table.get(id);
    if (!row) return undefined;
    return this.decryptRow(row);
  }

  async getAll(): Promise<T[]> {
    if (this.cache) return this.cache;
    if (this.inFlight) return this.inFlight;
    this.inFlight = (async () => {
      const rows = await this.table.toArray();
      const decrypted = await Promise.all(rows.map((row) => this.decryptRow(row)));
      this.cache = decrypted;
      this.inFlight = null;
      return decrypted;
    })();
    return this.inFlight;
  }

  async delete(id: string): Promise<void> {
    await this.table.delete(id);
    if (this.cache) this.cache = this.cache.filter((r) => r.id !== id);
  }

  async count(): Promise<number> {
    if (this.cache) return this.cache.length;
    return this.table.count();
  }

  /** Called only by `invalidateAllRepositoryCaches()` — see that function's own doc comment for the
   *  full list of the 4 raw-write paths that require it. */
  invalidateCache(): void {
    this.cache = null;
    this.inFlight = null;
  }

  /** Real indexed query when this repo has one (`expensesRepo` only) — decrypts just the matching
   *  rows instead of the whole table. Every other repo falls back to `getAll()` + a JS filter, which
   *  stays correct (just not the fast path) since there's no index to use. */
  async queryByDateRange(startMs: number, endMs: number): Promise<T[]> {
    if (this.indexed) {
      const rows = await this.indexed.table.queryByDateRange(startMs, endMs);
      return Promise.all(rows.map((row) => this.decryptRow(row)));
    }
    const all = await this.getAll();
    return all.filter((r) => {
      const date = (r as unknown as { date?: number }).date;
      return date !== undefined && date >= startMs && date <= endMs;
    });
  }

  /** Matches either `accountId` or `toAccountId` — the same convention every account-scoped view in
   *  this app already uses for transfers (a transfer's destination account is `toAccountId`, not
   *  `accountId`). See `queryByDateRange`'s doc comment for the fallback behavior. */
  async queryByAccount(accountId: string): Promise<T[]> {
    if (this.indexed) {
      const rows = await this.indexed.table.queryByAccount(accountId);
      return Promise.all(rows.map((row) => this.decryptRow(row)));
    }
    const all = await this.getAll();
    return all.filter((r) => {
      const rec = r as unknown as { accountId?: string; toAccountId?: string };
      return rec.accountId === accountId || rec.toAccountId === accountId;
    });
  }

  /** See `queryByDateRange`'s doc comment for the fallback behavior. */
  async queryByCategory(categoryId: string): Promise<T[]> {
    if (this.indexed) {
      const rows = await this.indexed.table.queryByCategory(categoryId);
      return Promise.all(rows.map((row) => this.decryptRow(row)));
    }
    const all = await this.getAll();
    return all.filter((r) => (r as unknown as { categoryId?: string }).categoryId === categoryId);
  }

  /** Only meaningful on `expensesRepo` — used exclusively by the one-time index backfill
   *  (`useExpenses.ts`, flag `penny_expense_index_v1`) to fill in the 5 index columns, in one batch,
   *  for rows written before this shipped (no re-encryption, since the records themselves haven't
   *  changed). A no-op on any repo without indexed-query support (there's nothing to backfill). */
  async backfillIndexColumnsBatch(entries: Array<{ id: string; fields: ExpenseIndexFields }>): Promise<void> {
    await this.indexed?.table.backfillIndexColumnsBatch(entries);
  }

  private async decryptRow(row: EncryptedRecord): Promise<T> {
    const mk = keystore.getMasterKey();
    const iv = base64ToBuffer(row.iv);
    const ciphertext = base64ToBuffer(row.ciphertext);
    const plaintext = await decrypt(mk, iv, ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  }
}
