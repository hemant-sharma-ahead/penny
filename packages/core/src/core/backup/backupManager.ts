// Encrypted backup/restore for all Penny data.
//
// File format (.penny):
//   v2 (envelope): { version: 2, wrappedMasterKeyByPassphrase, passphraseKekSalt, iv, ciphertext }
//   v1 (legacy):   { version: 1, mkSalt, iv, ciphertext }
//
// The bundle (inside ciphertext) holds all raw Dexie records for every encrypted
// store, plus the security record. Plain stores (price_cache, privacy_stats) are
// excluded — they rebuild automatically.
//
// The bundle is encrypted with the Data Master Key (DMK). To let restore recover the
// DMK from the passphrase, v2 carries the passphrase-wrapped DMK (already present in
// the security record) in the file header — useless without the passphrase. v1 files
// (legacy, passphrase-derived MK) remain restorable.
//
// On restore: passphrase → DMK → decrypt bundle → bulk-put records → lock session →
// user re-enters PIN.

import { db, restoreTables } from '@/core/db/schema';
import { deriveKey, decrypt, encrypt, unwrapKey } from '@/core/crypto/engine';
import { keystore } from '@/core/crypto/keystore';
import { lockSession } from '@/core/crypto/securityManager';
import { invalidateAllRepositoryCaches } from '@/core/db/repositories';
import { validMerchantMemoryKeys } from '@/core/expenses/merchantMemory';
import type { Expense, SecurityRecord } from '@/core/db/types';

const BACKUP_VERSION = 2 as const;
const MK_ITERATIONS = 600_000;

// All encrypted stores. Excludes price_cache and privacy_stats (plain, rebuildable).
//
// 2026-08-21: found via real-device restore-failure investigation that this list had silently drifted
// behind `schema.ts` — 8 real encrypted stores existed there but were never added here, so no backup
// ever included them and restoring one left them exactly as they were on the restoring device instead
// of replacing them. `accounts` is the serious one: every `Expense.accountId` references it, so a
// restore onto a wiped/new device brought back all transactions with literally zero accounts for them
// to belong to. The other 7 are real user data/decisions too (activity log, merchant-memory
// suggestions, saved templates, cash-withdrawal narration codes, and all 3 SMS-tracking tables —
// parsed-message links, the sender→account mapping, and the explicit "never a transaction" list), none
// of them safely rebuildable the way price_cache/privacy_stats are. Added all 8.
const BACKUP_STORES = [
  'security',
  'profile',
  'holdings',
  'expenses',
  'expense_categories',
  'budgets',
  'hashtags',
  'goals',
  'goal_contributions',
  'liabilities',
  'insurance_policies',
  'insurer_memory',
  'chip_insights',
  'ai_call_log',
  'subscriptions',
  'personal_ious',
  'persons',
  'ledger_entries',
  'credit_profile',
  'accounts',
  'activity_log',
  'merchant_memory',
  'transaction_templates',
  'device_keys',
  'group_keys',
  'sync_cursor',
  'groups',
  'group_members',
  'group_events',
  'bank_statement_imports',
  'bank_narration_overrides',
  'bank_cash_withdrawal_codes',
  'payment_modes',
  'retirement_plan',
  'net_worth_snapshots',
  'sms_transactions',
  'sms_account_mappings',
  'sms_excluded_senders'
] as const;

type BackupStore = (typeof BACKUP_STORES)[number];

// Stores merged by mergeBundle (non-destructive sync/recovery pulls). Excludes 'security':
// auth state (PIN/DMK wrapping) is device-specific and must never be silently overwritten by
// a pull — the destructive importBackup owns security for explicit recover-from-nothing.
const MERGE_STORES = BACKUP_STORES.filter((name) => name !== 'security');

interface BackupFileV1 {
  version: 1;
  mkSalt: string;
  iv: string;
  ciphertext: string;
}
interface BackupFileV2 {
  version: 2;
  wrappedMasterKeyByPassphrase: string;
  passphraseKekSalt: string;
  iv: string;
  ciphertext: string;
}
type BackupFile = BackupFileV1 | BackupFileV2;

function bufferToBase64(buf: ArrayBuffer): string {
  // Chunked to avoid "Maximum call stack size exceeded": spreading a full backup's ciphertext (all
  // encrypted data) into String.fromCharCode blows the argument stack. 32KB chunks stay well within limits.
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function exportBackup(): Promise<Blob> {
  const mk = keystore.getMasterKey(); // throws if session not active

  const stores: Record<string, unknown[]> = {};
  for (const name of BACKUP_STORES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stores[name] = await (db as any)[name].toArray();
  }

  const securityRow = (stores['security'] as SecurityRecord[])[0];
  if (!securityRow) throw new Error('No security record — cannot create backup');

  const plaintext = new TextEncoder().encode(JSON.stringify({ exportedAt: Date.now(), stores }));
  const { iv, ciphertext } = await encrypt(mk, plaintext);

  // The header carries what restore needs to recover the DMK from the passphrase.
  let file: BackupFile;
  if (securityRow.encryptedMasterKeyByPassphrase && securityRow.passphraseKekSalt) {
    file = {
      version: BACKUP_VERSION,
      wrappedMasterKeyByPassphrase: securityRow.encryptedMasterKeyByPassphrase,
      passphraseKekSalt: securityRow.passphraseKekSalt,
      iv: bufferToBase64(iv),
      ciphertext: bufferToBase64(ciphertext)
    };
  } else if (securityRow.mkSalt) {
    // Legacy vault not yet migrated to envelope encryption.
    file = { version: 1, mkSalt: securityRow.mkSalt, iv: bufferToBase64(iv), ciphertext: bufferToBase64(ciphertext) };
  } else {
    throw new Error('Vault has no passphrase key — change your passphrase once to enable backup');
  }

  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

/** Strip lockout/attempt-counter state from a restored security record so a stale lockout carried
 *  over from the backup's *original* device (or, worse, a backup taken mid-lockout) can't block PIN
 *  entry here — the wrapped key material (`kekSalt`/`encryptedMasterKey`) is left untouched, so the
 *  ORIGINAL PIN from when the backup was made is still what's required after restore (matching
 *  web-react's existing, intended behavior), just no longer blocked by counters that belong to a
 *  different device/moment. Found 2026-07-27: "no PIN worked after restore" on mobile traced to this,
 *  not to the restored PIN itself being wrong. */
function resetLockoutState(rows: unknown[]): unknown[] {
  if (!rows.length) return rows;
  return (rows as SecurityRecord[]).map((row) => ({
    ...row,
    pinAttempts: 0,
    lockedUntil: undefined,
    passphraseAttempts: 0,
    passphraseLockedUntil: undefined
  }));
}

// 2026-08-21, real-device testing feedback ("restored a backup with one transaction, but it never
// showed up anywhere after unlocking again"): traced (not assumed) to `SessionGate.tsx` — it toggles
// a `locked` boolean and never remounts `children`, so every screen/hook already mounted before the
// restore (`useHome`, `useExpenses`, `useAccounts`, etc.) keeps its pre-restore in-memory state
// forever; nothing here ever broadcast the app's existing `notifyTxnChanged()`/`notifyAccountsChanged()`
// staleness bus (`useTxnRefresh.ts`/`useDataRefresh.ts`) to tell them to reload, the same bus every
// other cross-hook writer in the app already relies on for this exact problem (see e.g.
// `useBankImport.ts`'s own comment on the identical failure mode). Firing that broadcast immediately
// here would be wrong too — the session is locked (`lockSession()` below) at exactly this point, so
// any reload callback that touches an `EncryptedRepository` would throw. Instead, set a flag the UI
// consumes exactly once, right after the user's *next* successful unlock (see `SessionGate.tsx`).
let pendingFullRefresh = false;

/** Consumed once by `SessionGate.tsx` immediately after a successful post-restore unlock — see the
 *  doc comment above `importBackup` for why the broadcast can't fire any earlier than that. */
export function consumePendingFullRefresh(): boolean {
  const pending = pendingFullRefresh;
  pendingFullRefresh = false;
  return pending;
}

/** Thrown when `options.signal` is aborted during phase 1 (see {@link importBackup}'s doc comment). */
export class RestoreCancelledError extends Error {
  constructor() {
    super('Restore cancelled');
    this.name = 'RestoreCancelledError';
  }
}

export interface ImportBackupOptions {
  /** Called exactly once, immediately before the atomic `restoreTables()` write begins — the real code
   *  boundary between "nothing's touched the database yet" and "an irreversible write is in flight"
   *  (Backup & Restore redesign's two-phase progress/cancel UI maps its phase transition to this, not a
   *  fixed delay). */
  onPhase2Start?: () => void;
  /** Checked at each cancellable point during phase 1 (parse/derive-key/decrypt) only. Phase 2's bulk
   *  write is atomic and, once started, always runs to completion — cancelling mid-write would be
   *  unsafe, so this is never consulted after `onPhase2Start` fires. Throws {@link RestoreCancelledError}
   *  when aborted. */
  signal?: AbortSignal;
}

export async function importBackup(
  fileText: string,
  passphrase: string,
  options: ImportBackupOptions = {}
): Promise<void> {
  const { onPhase2Start, signal } = options;
  function checkCancelled(): void {
    if (signal?.aborted) throw new RestoreCancelledError();
  }

  let file: BackupFile;
  try {
    file = JSON.parse(fileText) as BackupFile;
  } catch {
    throw new Error('Invalid backup file — could not parse JSON');
  }
  checkCancelled();

  // Recover the data key from the passphrase.
  let mk: CryptoKey;
  if (file.version === 1) {
    mk = await deriveKey(passphrase, base64ToBuffer(file.mkSalt), MK_ITERATIONS);
  } else if (file.version === 2) {
    try {
      const passKek = await deriveKey(passphrase, base64ToBuffer(file.passphraseKekSalt), MK_ITERATIONS);
      mk = await unwrapKey(base64ToBuffer(file.wrappedMasterKeyByPassphrase), passKek);
    } catch (err) {
      throw new Error('Incorrect passphrase or corrupted backup file', { cause: err });
    }
  } else {
    throw new Error(`Unsupported backup version: ${String((file as { version: unknown }).version)}`);
  }
  checkCancelled();

  let plaintext: ArrayBuffer;
  try {
    plaintext = await decrypt(mk, base64ToBuffer(file.iv), base64ToBuffer(file.ciphertext));
  } catch (err) {
    throw new Error('Incorrect passphrase or corrupted backup file', { cause: err });
  }
  checkCancelled();

  const bundle = JSON.parse(new TextDecoder().decode(plaintext)) as {
    exportedAt: number;
    stores: Record<string, unknown[]>;
  };

  // Real root cause of a real-device-only "undefined is not a function", found 2026-08-21 via a
  // captured on-device stack trace (reading the code alone never surfaced it, across two separate
  // investigation rounds): `apps/mobile` doesn't run on Dexie at all — `schema.native.ts` replaces it
  // with an op-sqlite-backed object implementing only this project's own `RowStore` abstraction
  // (`store.ts`: `get`/`put`/`toArray`/`delete`/`count`/`update`/`clear` — no `bulkPut`, no
  // `transaction`). This loop used to call `.bulkPut()` directly on `db[name]` — a real Dexie-only
  // method that only ever existed on the web build's actual Dexie tables (which is also why the vitest
  // suite never caught this: tests import the bare `schema.ts`, which Node has no Metro-style
  // `.native.ts` override for). A first fix (looping individual `RowStore.put()` calls, one per row,
  // with a manual snapshot-and-rollback for atomicity) was correct but took literal minutes on a real
  // transaction history — thousands of individual awaited native round-trips. `restoreTables()`
  // (exported from both `schema.ts` and `schema.native.ts`, same contract) replaces all of that with
  // one real bulk primitive per platform — Dexie's own `transaction()`/`bulkPut()` on web,
  // `op-sqlite`'s `executeBatch()` (many statements, one native round-trip, one real SQLite
  // transaction) on native — genuinely atomic on both, and fast.

  // Drop orphaned merchant-memory rows before they're restored — see `validMerchantMemoryKeys`'s own
  // doc comment for the full explanation (real-device testing, 2026-08-21: a restored vault suggested
  // "Test Expense" with zero actual matching transactions in it). `MerchantMemory.id` is a plaintext
  // `memoryKey()` string (only `iv`/`ciphertext` are encrypted), so only the incoming `expenses` rows
  // need decrypting here, not the memory rows themselves. Skipped entirely when there's no memory to
  // reconcile in the first place, to avoid decrypting a whole transaction history for nothing.
  const rawMemoryRows = bundle.stores['merchant_memory'] as { id: string }[] | undefined;
  if (rawMemoryRows?.length) {
    const rawExpenseRows = (bundle.stores['expenses'] as { id: string; iv: string; ciphertext: string }[]) ?? [];
    const decryptedExpenses = await Promise.all(
      rawExpenseRows.map(async (row) => {
        const rowPlaintext = await decrypt(mk, base64ToBuffer(row.iv), base64ToBuffer(row.ciphertext));
        return JSON.parse(new TextDecoder().decode(rowPlaintext)) as Expense;
      })
    );
    const validKeys = validMerchantMemoryKeys(decryptedExpenses);
    bundle.stores['merchant_memory'] = rawMemoryRows.filter((row) => validKeys.has(row.id));
  }
  checkCancelled();

  const entries = BACKUP_STORES.map((name) => {
    let rows = bundle.stores[name as BackupStore];
    if (name === 'security' && rows) rows = resetLockoutState(rows);
    return { name, rows };
  });
  // Last cancellable point — phase 1 (parse/derive-key/decrypt) is done and nothing has touched the
  // database yet. Once `onPhase2Start` fires, the write below is atomic and always runs to completion.
  checkCancelled();
  onPhase2Start?.();
  await restoreTables(entries);
  // Bypasses every `EncryptedRepository` (a raw batch write) — see
  // `invalidateAllRepositoryCaches()`'s own doc comment for why this is required here. Safe to call
  // before the session lock below: it only drops in-memory caches, it doesn't touch the DMK.
  invalidateAllRepositoryCaches();

  // Every already-mounted screen/hook needs to reload once the session is unlocked again — see the
  // doc comment above `consumePendingFullRefresh` for the full explanation.
  pendingFullRefresh = true;

  // Lock session — user must re-enter their original PIN after restore.
  lockSession();
}

// ─── Non-destructive merge (Phase 1.5 Track B) ─────────────────────────────────
// Used by sync/recovery pulls once the vault is already unlocked. Unlike importBackup
// (clear + bulkPut, destructive), mergeBundle upserts with last-write-wins on updatedAt and
// never clears — so a pull can't clobber changes made locally since the blob was written.

interface EncryptedRow {
  id: string;
  iv: string;
  ciphertext: string;
}

interface TimestampedRecord {
  id: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface MergeStats {
  applied: number;
  skipped: number;
  perStore: Record<string, { applied: number; skipped: number }>;
}

/**
 * Last-write-wins decision, pure and I/O-free. Incoming wins if there is no local record, or
 * if its timestamp is at least as recent. Falls back to createdAt for the stores that lack
 * updatedAt, then to 0. Ties favour incoming (idempotent re-merge of the same blob is a no-op).
 */
export function shouldApplyIncoming(local: TimestampedRecord | undefined, incoming: TimestampedRecord): boolean {
  if (!local) return true;
  const localTs = local.updatedAt ?? local.createdAt ?? 0;
  const incomingTs = incoming.updatedAt ?? incoming.createdAt ?? 0;
  return incomingTs >= localTs;
}

async function decryptRow(mk: CryptoKey, row: EncryptedRow): Promise<TimestampedRecord> {
  const plaintext = await decrypt(mk, base64ToBuffer(row.iv), base64ToBuffer(row.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext)) as TimestampedRecord;
}

async function encryptRow(mk: CryptoKey, record: TimestampedRecord): Promise<EncryptedRow> {
  const { iv, ciphertext } = await encrypt(mk, new TextEncoder().encode(JSON.stringify(record)));
  return { id: record.id, iv: bufferToBase64(iv), ciphertext: bufferToBase64(ciphertext) };
}

/**
 * Merge an incoming bundle's records into the local vault non-destructively. The bundle carries
 * encrypted rows (same shape exportBackup produces); same-user blobs share the DMK, so rows
 * decrypt with the local key. For each row: LWW via {@link shouldApplyIncoming}, preserving the
 * local createdAt when the incoming record wins. Upsert-only — it cannot observe remote deletes
 * (delete tombstones arrive with the activity-log delta sync in Track D). Requires an unlocked session.
 */
export async function mergeBundle(bundle: { stores: Record<string, unknown[]> }): Promise<MergeStats> {
  const mk = keystore.getMasterKey(); // throws if session not active
  const stats: MergeStats = { applied: 0, skipped: 0, perStore: {} };

  for (const name of MERGE_STORES) {
    const rows = (bundle.stores[name] as EncryptedRow[] | undefined) ?? [];
    const perStore = { applied: 0, skipped: 0 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = (db as any)[name] as {
      get(id: string): Promise<EncryptedRow | undefined>;
      put(row: EncryptedRow): Promise<unknown>;
    };

    for (const row of rows) {
      const incoming = await decryptRow(mk, row);
      const localRow = await table.get(row.id);
      const local = localRow ? await decryptRow(mk, localRow) : undefined;

      if (shouldApplyIncoming(local, incoming)) {
        // Keep the earliest createdAt so provenance survives the merge.
        const merged = local?.createdAt !== undefined ? { ...incoming, createdAt: local.createdAt } : incoming;
        await table.put(await encryptRow(mk, merged));
        perStore.applied++;
      } else {
        perStore.skipped++;
      }
    }

    stats.perStore[name] = perStore;
    stats.applied += perStore.applied;
    stats.skipped += perStore.skipped;
  }

  // Bypasses every `EncryptedRepository` (raw `table.put()` above) — see
  // `invalidateAllRepositoryCaches()`'s own doc comment. Unlike `importBackup`, this can run mid-session
  // with other screens already mounted and reading cached data, so this has to fire unconditionally,
  // not just for the stores that actually changed — simplest correct option, and cheap since a sync/
  // recovery merge is not a hot path.
  invalidateAllRepositoryCaches();
  return stats;
}

/** Thrown when a blob can't be opened with the current DMK — it belongs to a different vault and
 *  needs an explicit passphrase restore (importBackup), not a background merge. */
export class ForeignBlobError extends Error {
  constructor() {
    super('Backup blob is not decryptable with the current key');
    this.name = 'ForeignBlobError';
  }
}

/**
 * Open a `.penny` file to its inner bundle (`{stores}`) using the in-memory DMK — no passphrase.
 * For same-user same-DMK blobs (background sync pulls); feed the result to {@link mergeBundle}.
 * Throws {@link ForeignBlobError} when the DMK can't decrypt it (a different vault). Requires an
 * unlocked session.
 */
export async function openBundleWithDmk(fileText: string): Promise<{ stores: Record<string, unknown[]> }> {
  const mk = keystore.getMasterKey(); // throws if session not active
  let file: BackupFile;
  try {
    file = JSON.parse(fileText) as BackupFile;
  } catch {
    throw new Error('Invalid backup file — could not parse JSON');
  }
  let plaintext: ArrayBuffer;
  try {
    plaintext = await decrypt(mk, base64ToBuffer(file.iv), base64ToBuffer(file.ciphertext));
  } catch {
    throw new ForeignBlobError();
  }
  const bundle = JSON.parse(new TextDecoder().decode(plaintext)) as {
    exportedAt: number;
    stores: Record<string, unknown[]>;
  };
  return { stores: bundle.stores };
}
