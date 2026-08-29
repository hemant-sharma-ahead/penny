import type { ExpenseRowStore, IndexedExpenseRow, RowStore } from './store';
import type {
  Account,
  ActivityLog,
  AiCallLog,
  BankCashWithdrawalCode,
  BankNarrationOverride,
  BankStatementImportRecord,
  Budget,
  ChipInsight,
  CreditProfile,
  DeviceKey,
  Expense,
  ExpenseCategory,
  Goal,
  GoalContribution,
  Group,
  GroupEvent,
  GroupKey,
  GroupMember,
  Hashtag,
  Holding,
  InsurancePolicy,
  LedgerEntry,
  Liability,
  MerchantMemory,
  NetWorthSnapshot,
  PaymentMode,
  Person,
  PersonalIou,
  PriceCache,
  PrivacyStat,
  Profile,
  RetirementPlan,
  SecurityRecord,
  SmsAccountMapping,
  SmsExcludedSender,
  SmsTransactionRecord,
  Subscription,
  SyncCursor,
  TransactionTemplate
} from './types';

/**
 * Node/`vitest` storage engine — the THIRD implementation of this seam, and the only one that never
 * runs in production. History:
 *
 * - Originally Dexie/IndexedDB, doubling as both `apps/web-react`'s real production engine and the
 *   engine every `vitest` test ran against (via `fake-indexeddb`).
 * - `apps/web-react` was retired 2026-08-29 (frozen since 2026-07-31, never updated past that point,
 *   fully superseded by `apps/mobile`) — once it was gone, Dexie had no production consumer left at
 *   all; `apps/mobile` has run on `schema.native.ts` (`@op-engineering/op-sqlite`) exclusively since
 *   Track 2 of the mobile migration. Keeping a real browser-database dependency (`dexie` +
 *   `fake-indexeddb`) around purely to give tests something to run against was real, avoidable
 *   complexity — so this file dropped Dexie and became a plain in-memory `Map`-backed implementation
 *   of the exact same contract instead.
 *
 * This is why the file is still named `schema.ts` and still lives at this same import path
 * (`./schema`, `@/core/db/schema`) even though it's no longer Dexie: every consumer (`repositories.ts`,
 * `securityManager.ts`, `backupManager.ts`, `seedDemoData.ts`, `priceCache.ts`, the market-data
 * clients) already imports this bare specifier, and Metro's platform-extension resolution already
 * sends `apps/mobile` to `schema.native.ts` for the exact same bare specifier — keeping the filename
 * and export shape identical meant zero import-site changes anywhere in the codebase, the same
 * "swap the engine underneath, callers never notice" property `store.ts`'s `RowStore<T>` seam was
 * always designed to give every storage-engine swap (see that file's own doc comment).
 *
 * A plain `Map` needs none of `schema.native.ts`'s SQL-column machinery (typed columns for the
 * always-`{id,iv,ciphertext}` shape vs. a JSON-blob column for the 3 arbitrary-shape tables,
 * `PRAGMA`-guarded `ALTER TABLE`, real `CREATE INDEX`) — it stores whatever object it's given,
 * so every table (including `expenses`' 5 extra plaintext index fields) uses the exact same factory.
 * The trade-off, accepted deliberately: this engine exercises `EncryptedRepository`'s business logic
 * faithfully, but — like `schema.native.ts` — has no bearing on real SQL correctness. Neither
 * engine's tests are a substitute for the other; `schema.native.ts`'s own real SQL query logic still
 * has zero automated coverage by this codebase's own established rule, verified only on-device.
 */

const ALL_TABLES = [
  'price_cache',
  'privacy_stats',
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

/** A table's backing `Map` plus the `RowStore<T>` view over it. `restoreTables()` below needs the raw
 *  `Map` directly (to snapshot/roll back atomically); every other caller only ever sees `.store`. */
interface TableHandle<T extends { id: string }> {
  raw: Map<string, T>;
  store: RowStore<T>;
}

function makeTable<T extends { id: string }>(): TableHandle<T> {
  const raw = new Map<string, T>();
  const store: RowStore<T> = {
    async get(id) {
      return raw.get(id);
    },
    async put(record) {
      raw.set(record.id, record);
    },
    async toArray() {
      return [...raw.values()];
    },
    async delete(id) {
      raw.delete(id);
    },
    async count() {
      return raw.size;
    },
    async update(id, changes) {
      const existing = raw.get(id);
      if (!existing) return undefined;
      const merged = { ...existing, ...changes };
      raw.set(id, merged);
      return merged;
    },
    async clear() {
      raw.clear();
    }
  };
  return { raw, store };
}

/** `expenses`-only handle — same `Map`-backed shape as every other table, plus the 3 indexed-query
 *  methods and the batch backfill `ExpenseRowStore` adds (`store.ts`). No real index is needed for a
 *  `Map` this size (tests never approach real-device row counts) — these are plain linear scans,
 *  correct but not performance-representative of either real engine. */
function makeExpensesTable(): { raw: Map<string, IndexedExpenseRow>; store: ExpenseRowStore } {
  const { raw, store: base } = makeTable<IndexedExpenseRow>();
  const store: ExpenseRowStore = {
    ...base,
    async queryByDateRange(startMs, endMs) {
      return [...raw.values()].filter((r) => r.date !== undefined && r.date >= startMs && r.date <= endMs);
    },
    async queryByAccount(accountId) {
      return [...raw.values()].filter((r) => r.accountId === accountId || r.toAccountId === accountId);
    },
    async queryByCategory(categoryId) {
      return [...raw.values()].filter((r) => r.categoryId === categoryId);
    },
    async backfillIndexColumnsBatch(entries) {
      for (const { id, fields } of entries) {
        const existing = raw.get(id);
        if (existing) raw.set(id, { ...existing, ...fields });
      }
    }
  };
  return { raw, store };
}

const expensesHandle = makeExpensesTable();

const handles: Record<(typeof ALL_TABLES)[number], TableHandle<{ id: string }>> = Object.fromEntries(
  ALL_TABLES.map((name) => [name, name === 'expenses' ? expensesHandle : makeTable()])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any;

/** Real per-table typed properties (mirroring `schema.native.ts`'s identical "declared type lies for
 *  convenience" convention — the runtime store is generic, the declared type matches each domain
 *  shape so callers like `securityManager.ts` keep real types instead of collapsing to `unknown`). */
export const db = {
  price_cache: handles.price_cache.store as unknown as RowStore<PriceCache>,
  privacy_stats: handles.privacy_stats.store as unknown as RowStore<PrivacyStat>,
  security: handles.security.store as unknown as RowStore<SecurityRecord>,
  profile: handles.profile.store as unknown as RowStore<Profile>,
  holdings: handles.holdings.store as unknown as RowStore<Holding>,
  expenses: expensesHandle.store as unknown as RowStore<Expense>,
  expense_categories: handles.expense_categories.store as unknown as RowStore<ExpenseCategory>,
  budgets: handles.budgets.store as unknown as RowStore<Budget>,
  hashtags: handles.hashtags.store as unknown as RowStore<Hashtag>,
  goals: handles.goals.store as unknown as RowStore<Goal>,
  goal_contributions: handles.goal_contributions.store as unknown as RowStore<GoalContribution>,
  liabilities: handles.liabilities.store as unknown as RowStore<Liability>,
  insurance_policies: handles.insurance_policies.store as unknown as RowStore<InsurancePolicy>,
  chip_insights: handles.chip_insights.store as unknown as RowStore<ChipInsight>,
  ai_call_log: handles.ai_call_log.store as unknown as RowStore<AiCallLog>,
  subscriptions: handles.subscriptions.store as unknown as RowStore<Subscription>,
  personal_ious: handles.personal_ious.store as unknown as RowStore<PersonalIou>,
  persons: handles.persons.store as unknown as RowStore<Person>,
  ledger_entries: handles.ledger_entries.store as unknown as RowStore<LedgerEntry>,
  credit_profile: handles.credit_profile.store as unknown as RowStore<CreditProfile>,
  accounts: handles.accounts.store as unknown as RowStore<Account>,
  activity_log: handles.activity_log.store as unknown as RowStore<ActivityLog>,
  merchant_memory: handles.merchant_memory.store as unknown as RowStore<MerchantMemory>,
  transaction_templates: handles.transaction_templates.store as unknown as RowStore<TransactionTemplate>,
  device_keys: handles.device_keys.store as unknown as RowStore<DeviceKey>,
  group_keys: handles.group_keys.store as unknown as RowStore<GroupKey>,
  sync_cursor: handles.sync_cursor.store as unknown as RowStore<SyncCursor>,
  groups: handles.groups.store as unknown as RowStore<Group>,
  group_members: handles.group_members.store as unknown as RowStore<GroupMember>,
  group_events: handles.group_events.store as unknown as RowStore<GroupEvent>,
  bank_statement_imports: handles.bank_statement_imports.store as unknown as RowStore<BankStatementImportRecord>,
  bank_narration_overrides: handles.bank_narration_overrides.store as unknown as RowStore<BankNarrationOverride>,
  bank_cash_withdrawal_codes: handles.bank_cash_withdrawal_codes.store as unknown as RowStore<BankCashWithdrawalCode>,
  payment_modes: handles.payment_modes.store as unknown as RowStore<PaymentMode>,
  retirement_plan: handles.retirement_plan.store as unknown as RowStore<RetirementPlan>,
  net_worth_snapshots: handles.net_worth_snapshots.store as unknown as RowStore<NetWorthSnapshot>,
  sms_transactions: handles.sms_transactions.store as unknown as RowStore<SmsTransactionRecord>,
  sms_account_mappings: handles.sms_account_mappings.store as unknown as RowStore<SmsAccountMapping>,
  sms_excluded_senders: handles.sms_excluded_senders.store as unknown as RowStore<SmsExcludedSender>,
  // Used by `securityManager.ts`'s `wipeAllData()` — every store, untyped, since all that's needed is
  // `.clear()`. Mirrors `schema.native.ts`'s identical `db.tables` (itself mirroring Dexie's own).
  tables: ALL_TABLES.map((name) => handles[name].store) as RowStore<unknown>[]
};

export const expensesIndexedStore: ExpenseRowStore = expensesHandle.store;

/** Same contract as `schema.native.ts`'s `restoreTables()` (see that file's doc comment for the full
 *  incident this exists to fix) — clears and repopulates many tables from a backup restore, atomically:
 *  if any table's write throws partway through, every table is rolled back to its pre-call state
 *  rather than left half-restored. Real engines get this from their own primitives (Dexie's
 *  `transaction()`, op-sqlite's `executeBatch()`); this in-memory engine has no such primitive to
 *  borrow, so it snapshots every named table's `Map` up front and restores those snapshots on error. */
export async function restoreTables(entries: Array<{ name: string; rows: unknown[] | undefined }>): Promise<void> {
  const named = entries
    .map((e) => ({ ...e, handle: (handles as Record<string, TableHandle<{ id: string }>>)[e.name] }))
    .filter((e): e is typeof e & { handle: TableHandle<{ id: string }> } => e.handle !== undefined);
  const snapshots = named.map((e) => ({ handle: e.handle, raw: new Map(e.handle.raw) }));
  try {
    for (const { rows, handle } of named) {
      // Via `store.clear()`/`store.put()` (not `handle.raw` directly) — real, spy-able calls, so a
      // test can simulate a partial-restore failure by mocking one table's `put()`, matching how the
      // real engines' own per-row/per-batch write calls can genuinely fail partway through.
      await handle.store.clear();
      if (rows?.length) for (const r of rows as Array<{ id: string }>) await handle.store.put(r);
    }
  } catch (err) {
    for (const { handle, raw } of snapshots) {
      handle.raw.clear();
      for (const [k, v] of raw) handle.raw.set(k, v);
    }
    throw err;
  }
}
