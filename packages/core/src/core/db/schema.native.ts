import { open } from '@op-engineering/op-sqlite';
import type { RowStore } from './store';
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
 * React Native storage adapter — third implementation of this file. History, each swap driven by a real
 * on-device bug, not speculation:
 *
 * 1. **`expo-sqlite`** (Track 2). Needed a single app-wide FIFO queue serializing *every* DB call —
 *    reads included — because its native binding corrupted its statement handle under concurrent access
 *    (a real crash during demo-data seeding). That queue meant 8 independent table reads on
 *    `useExpenses.ts` mount ran strictly one-at-a-time, on top of an async bridge round-trip per call.
 * 2. **`react-native-mmkv`** (2026-07-26, earlier this session). Removed the queue and the per-call bridge
 *    cost — every call is synchronous JSI, no shared connection to corrupt. Fast per-call, but that's the
 *    problem: *every* call runs inline on the JS thread, so a bulk read of ~1,000 rows is 1,000 synchronous
 *    calls back-to-back, monopolizing the JS thread for the whole loop with no chance for the UI to stay
 *    responsive during it — unlike Dexie/IndexedDB on web (and Capacitor, which still runs the same Dexie
 *    code), where the actual bulk scan happens off the JS thread inside the browser engine. User confirmed
 *    on-device this still didn't feel as smooth as web.
 * 3. **`@op-engineering/op-sqlite`** (this version). Real async SQLite: `execute()` dispatches to a native
 *    thread and only the final result crosses back to JS, so a bulk read doesn't block the JS thread the
 *    way MMKV's synchronous calls did — the same "off-thread, single result handoff" shape Dexie/IndexedDB
 *    already has. WAL journal mode is enabled for standard SQLite concurrency/durability characteristics.
 *    Also fixes a second, independent inefficiency present in *both* prior RN adapters (not just MMKV):
 *    both stored each encrypted row as `JSON.stringify({id, iv, ciphertext})` in a single text
 *    column/value — a wrapper layer Dexie never needed, since IndexedDB stores that same `{id, iv,
 *    ciphertext}` object directly via structured clone. This version gives the ~27 always-`{id, iv,
 *    ciphertext}`-shaped "encrypted" tables real typed columns (`id`/`iv`/`ciphertext`, no JSON wrapper at
 *    all) — only the 3 tables with genuinely arbitrary per-table shape (`security`/`price_cache`/
 *    `privacy_stats`) keep a JSON `data` column, since a generic `RowStore<T>` can't know their shape
 *    ahead of time the way it can for the fixed `EncryptedRecord` shape every `EncryptedRepository`-wrapped
 *    table always has.
 *
 * Never bundled on web: apps/web-react imports `./schema` (bare, extensionless), and Metro/Vite each
 * resolve that differently — Metro prefers `schema.native.ts` for RN, Vite has no such convention and
 * just resolves `schema.ts` as always.
 *
 * Only one connection is opened, per op-sqlite's own guidance ("recommended you only open one connection
 * per App session") — no manual reader/writer connection pool. `execute()`'s own dispatch to a native
 * thread is what removes JS-thread blocking, not multiple connections; op-sqlite's docs don't expose (or
 * recommend) a multi-connection pattern the way some other bindings do.
 */

const sqlite = open({ name: 'penny.db' });

// One-time PRAGMA setup — see the module doc comment. `IF NOT EXISTS` for every table means there's no
// versioned migrations table needed (unlike the old `expo-sqlite` adapter): a fresh column set is fixed
// forever once created this way, so re-running the same `CREATE TABLE IF NOT EXISTS` on every launch is
// simply a no-op after the first.
const ENCRYPTED_TABLES = [
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
];
const PLAIN_TABLES = ['security', 'price_cache', 'privacy_stats'];

const ready = (async () => {
  await sqlite.execute('PRAGMA journal_mode = WAL;');
  for (const name of ENCRYPTED_TABLES) {
    await sqlite.execute(
      `CREATE TABLE IF NOT EXISTS ${name} (id TEXT PRIMARY KEY NOT NULL, iv TEXT NOT NULL, ciphertext TEXT NOT NULL)`
    );
  }
  for (const name of PLAIN_TABLES) {
    await sqlite.execute(`CREATE TABLE IF NOT EXISTS ${name} (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL)`);
  }
})();

interface EncryptedRow {
  id: string;
  iv: string;
  ciphertext: string;
}

/** Real typed columns (`id`/`iv`/`ciphertext`) for the ~27 tables an `EncryptedRepository` always writes
 *  in this exact shape — no JSON wrapper layer, matching how Dexie/IndexedDB stores this same object
 *  directly via structured clone on web. */
function makeEncryptedRowStore(tableName: string): RowStore<EncryptedRow> {
  return {
    async get(id) {
      await ready;
      const { rows } = await sqlite.execute(`SELECT id, iv, ciphertext FROM ${tableName} WHERE id = ? LIMIT 1`, [id]);
      return rows[0] as unknown as EncryptedRow | undefined;
    },
    async put(record) {
      await ready;
      await sqlite.execute(
        `INSERT INTO ${tableName} (id, iv, ciphertext) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET iv = excluded.iv, ciphertext = excluded.ciphertext`,
        [record.id, record.iv, record.ciphertext]
      );
    },
    async toArray() {
      await ready;
      const { rows } = await sqlite.execute(`SELECT id, iv, ciphertext FROM ${tableName}`);
      return rows as unknown as EncryptedRow[];
    },
    async delete(id) {
      await ready;
      await sqlite.execute(`DELETE FROM ${tableName} WHERE id = ?`, [id]);
    },
    async count() {
      await ready;
      const { rows } = await sqlite.execute(`SELECT COUNT(*) as n FROM ${tableName}`);
      return Number((rows[0] as { n: number } | undefined)?.n ?? 0);
    },
    // Never actually called in practice — `EncryptedRepository` doesn't expose an `.update()` method at
    // all, only the 3 plain tables' direct callers (`securityManager.ts`) use `RowStore.update()`.
    // Implemented anyway for interface completeness.
    async update(id, changes) {
      await ready;
      const { rows } = await sqlite.execute(`SELECT id, iv, ciphertext FROM ${tableName} WHERE id = ? LIMIT 1`, [id]);
      const existing = rows[0] as unknown as EncryptedRow | undefined;
      if (!existing) return undefined;
      const merged = { ...existing, ...changes };
      await sqlite.execute(`UPDATE ${tableName} SET iv = ?, ciphertext = ? WHERE id = ?`, [
        merged.iv,
        merged.ciphertext,
        id
      ]);
      return merged;
    },
    async clear() {
      await ready;
      await sqlite.execute(`DELETE FROM ${tableName}`);
    }
  };
}

interface JsonRow {
  id: string;
  data: string;
}

/** Generic JSON-blob-column store for the 3 tables with genuinely arbitrary, per-table shape
 *  (`SecurityRecord`/`PriceCache`/`PrivacyStat`) — a real column-per-field schema isn't possible here
 *  without this factory knowing each table's individual field list ahead of time. */
function makeJsonRowStore<T>(tableName: string): RowStore<T> {
  return {
    async get(id) {
      await ready;
      const { rows } = await sqlite.execute(`SELECT id, data FROM ${tableName} WHERE id = ? LIMIT 1`, [id]);
      const row = rows[0] as unknown as JsonRow | undefined;
      return row ? (JSON.parse(row.data) as T) : undefined;
    },
    async put(record) {
      await ready;
      const id = (record as { id: string }).id;
      await sqlite.execute(
        `INSERT INTO ${tableName} (id, data) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
        [id, JSON.stringify(record)]
      );
    },
    async toArray() {
      await ready;
      const { rows } = await sqlite.execute(`SELECT id, data FROM ${tableName}`);
      return (rows as unknown as JsonRow[]).map((r) => JSON.parse(r.data) as T);
    },
    async delete(id) {
      await ready;
      await sqlite.execute(`DELETE FROM ${tableName} WHERE id = ?`, [id]);
    },
    async count() {
      await ready;
      const { rows } = await sqlite.execute(`SELECT COUNT(*) as n FROM ${tableName}`);
      return Number((rows[0] as { n: number } | undefined)?.n ?? 0);
    },
    async update(id, changes) {
      await ready;
      const { rows } = await sqlite.execute(`SELECT id, data FROM ${tableName} WHERE id = ? LIMIT 1`, [id]);
      const row = rows[0] as unknown as JsonRow | undefined;
      if (!row) return undefined;
      const merged = { ...(JSON.parse(row.data) as object), ...changes };
      await sqlite.execute(`UPDATE ${tableName} SET data = ? WHERE id = ?`, [JSON.stringify(merged), id]);
      return merged as T;
    },
    async clear() {
      await ready;
      await sqlite.execute(`DELETE FROM ${tableName}`);
    }
  };
}

// Explicit per-table typed properties (mirroring schema.ts's Dexie EntityTable<T,'id'> class fields) so
// callers like securityManager.ts (`(await db.security.toArray())[0]` typed as SecurityRecord) keep their
// real types instead of collapsing to `unknown`. Every encrypted-table property is declared as
// `RowStore<DomainType>` (matching schema.ts's Dexie typing exactly) even though the actual runtime store
// is `RowStore<EncryptedRow>` — the same bridging cast `repositories.ts`'s `db.<table> as never` already
// relies on to construct `EncryptedRepository<DomainType>`; only `tables` (below) is deliberately
// untyped, same as Dexie's own `Table<any>[]`.
const tableStores = {
  price_cache: makeJsonRowStore<PriceCache>('price_cache'),
  privacy_stats: makeJsonRowStore<PrivacyStat>('privacy_stats'),
  security: makeJsonRowStore<SecurityRecord>('security'),

  profile: makeEncryptedRowStore('profile') as unknown as RowStore<Profile>,
  holdings: makeEncryptedRowStore('holdings') as unknown as RowStore<Holding>,
  expenses: makeEncryptedRowStore('expenses') as unknown as RowStore<Expense>,
  expense_categories: makeEncryptedRowStore('expense_categories') as unknown as RowStore<ExpenseCategory>,
  budgets: makeEncryptedRowStore('budgets') as unknown as RowStore<Budget>,
  hashtags: makeEncryptedRowStore('hashtags') as unknown as RowStore<Hashtag>,
  goals: makeEncryptedRowStore('goals') as unknown as RowStore<Goal>,
  goal_contributions: makeEncryptedRowStore('goal_contributions') as unknown as RowStore<GoalContribution>,
  liabilities: makeEncryptedRowStore('liabilities') as unknown as RowStore<Liability>,
  insurance_policies: makeEncryptedRowStore('insurance_policies') as unknown as RowStore<InsurancePolicy>,
  chip_insights: makeEncryptedRowStore('chip_insights') as unknown as RowStore<ChipInsight>,
  ai_call_log: makeEncryptedRowStore('ai_call_log') as unknown as RowStore<AiCallLog>,
  subscriptions: makeEncryptedRowStore('subscriptions') as unknown as RowStore<Subscription>,
  personal_ious: makeEncryptedRowStore('personal_ious') as unknown as RowStore<PersonalIou>,
  credit_profile: makeEncryptedRowStore('credit_profile') as unknown as RowStore<CreditProfile>,
  accounts: makeEncryptedRowStore('accounts') as unknown as RowStore<Account>,
  activity_log: makeEncryptedRowStore('activity_log') as unknown as RowStore<ActivityLog>,
  merchant_memory: makeEncryptedRowStore('merchant_memory') as unknown as RowStore<MerchantMemory>,
  transaction_templates: makeEncryptedRowStore('transaction_templates') as unknown as RowStore<TransactionTemplate>,
  persons: makeEncryptedRowStore('persons') as unknown as RowStore<Person>,
  ledger_entries: makeEncryptedRowStore('ledger_entries') as unknown as RowStore<LedgerEntry>,
  device_keys: makeEncryptedRowStore('device_keys') as unknown as RowStore<DeviceKey>,
  group_keys: makeEncryptedRowStore('group_keys') as unknown as RowStore<GroupKey>,
  sync_cursor: makeEncryptedRowStore('sync_cursor') as unknown as RowStore<SyncCursor>,
  groups: makeEncryptedRowStore('groups') as unknown as RowStore<Group>,
  group_members: makeEncryptedRowStore('group_members') as unknown as RowStore<GroupMember>,
  group_events: makeEncryptedRowStore('group_events') as unknown as RowStore<GroupEvent>,
  bank_statement_imports: makeEncryptedRowStore(
    'bank_statement_imports'
  ) as unknown as RowStore<BankStatementImportRecord>,
  bank_narration_overrides: makeEncryptedRowStore(
    'bank_narration_overrides'
  ) as unknown as RowStore<BankNarrationOverride>,
  bank_cash_withdrawal_codes: makeEncryptedRowStore(
    'bank_cash_withdrawal_codes'
  ) as unknown as RowStore<BankCashWithdrawalCode>,
  payment_modes: makeEncryptedRowStore('payment_modes') as unknown as RowStore<PaymentMode>,
  retirement_plan: makeEncryptedRowStore('retirement_plan') as unknown as RowStore<RetirementPlan>,
  net_worth_snapshots: makeEncryptedRowStore('net_worth_snapshots') as unknown as RowStore<NetWorthSnapshot>,
  sms_transactions: makeEncryptedRowStore('sms_transactions') as unknown as RowStore<SmsTransactionRecord>,
  sms_account_mappings: makeEncryptedRowStore('sms_account_mappings') as unknown as RowStore<SmsAccountMapping>,
  sms_excluded_senders: makeEncryptedRowStore('sms_excluded_senders') as unknown as RowStore<SmsExcludedSender>
};

export const db = {
  ...tableStores,
  // Dexie's `db.tables` (used by securityManager.ts's wipeAllData()) — every RowStore, untyped, since all
  // that's needed is `.clear()`.
  tables: Object.values(tableStores) as RowStore<unknown>[]
};
