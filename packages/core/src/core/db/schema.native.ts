import * as SQLite from 'expo-sqlite';
import type { RowStore } from './store';
import type {
  Account,
  ActivityLog,
  AiCallLog,
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
  Person,
  PersonalIou,
  PriceCache,
  PrivacyStat,
  Profile,
  SecurityRecord,
  Subscription,
  SyncCursor,
  TransactionTemplate
} from './types';

/**
 * React Native storage adapter (Track 2 of the mobile migration) — replaces schema.ts's Dexie/IndexedDB
 * implementation with expo-sqlite. Never bundled on web: apps/web-legacy imports `./schema` (bare,
 * extensionless), and Metro/Vite each resolve that differently — Metro prefers `schema.native.ts` for RN,
 * Vite has no such convention and just resolves `schema.ts` as always. Zero web-side impact (verified via
 * bundle inspection — see the Track 2 progress log in docs/plans/mobile-migration.md).
 *
 * Every store (both the "encrypted" ones storing {id, iv, ciphertext} and the couple of plain ones like
 * `security`/`price_cache`) is represented as a 2-column table `(id TEXT PRIMARY KEY, data TEXT NOT NULL)`
 * holding `JSON.stringify(row)` — this mirrors exactly what's already on disk in the Dexie version (every
 * row is already a plain JSON-serializable object) without needing per-table column schemas, and satisfies
 * the same RowStore<T> interface repository.ts/securityManager.ts/priceCache.ts already call against.
 */

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function openDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('penny.db').then(async (database) => {
      await runMigrations(database);
      return database;
    });
  }
  return dbPromise;
}

// Serializes every operation against the single shared connection. expo-sqlite's native binding isn't
// safe against a large burst of concurrent statements on one connection — seedDemoData.ts/
// seedGroupFixtures.ts's `Promise.all(items.map(repo.put))` pattern (up to a few hundred concurrent
// `put`s across a handful of tables, several hitting `expenses` from three different call sites at once)
// reproduced this exactly on-device: some writes were silently lost (rows missing after seeding
// completed with no thrown error) and, separately, a later query failed with "Cannot use shared object
// that was already released" — a corrupted native statement handle, severe enough to have crashed the
// whole emulator process during testing, not just the app. A single FIFO queue over every call (reads
// included, since the native error was in `prepareAsync`, not write-specific) is the simplest fix that
// protects every current and future caller — not a per-call-site patch.
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn, fn);
  queue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

/** Mirrors schema.ts's Dexie version history — every migration here is an additive table creation
 * (no data transforms), so replaying all of them on a fresh install just creates every table once. A
 * `_migrations` table tracks what's applied so a future v10+ addition only runs its own new statements. */
async function runMigrations(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync('CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY)');
  const applied = await database.getAllAsync<{ version: number }>('SELECT version FROM _migrations');
  const appliedVersions = new Set(applied.map((r) => r.version));

  const createTable = (name: string) =>
    `CREATE TABLE IF NOT EXISTS ${name} (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL)`;

  const migrations: { version: number; tables: string[] }[] = [
    {
      version: 1,
      tables: [
        'price_cache',
        'privacy_stats',
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
        'security',
        'subscriptions',
        'personal_ious',
        'credit_profile'
      ]
    },
    { version: 2, tables: ['accounts'] },
    // v3 (dropped `assets`) — nothing to create; RN never had it.
    { version: 4, tables: ['activity_log'] },
    { version: 5, tables: ['merchant_memory'] },
    { version: 6, tables: ['transaction_templates'] },
    { version: 7, tables: ['persons', 'ledger_entries'] },
    { version: 8, tables: ['device_keys', 'group_keys', 'sync_cursor'] },
    { version: 9, tables: ['groups', 'group_members', 'group_events'] }
  ];

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;
    await database.withTransactionAsync(async () => {
      for (const table of migration.tables) {
        await database.execAsync(createTable(table));
      }
      await database.runAsync('INSERT INTO _migrations (version) VALUES (?)', migration.version);
    });
  }
}

interface Row {
  id: string;
  data: string;
}

function makeRowStore<T>(tableName: string): RowStore<T> {
  return {
    async get(id) {
      return enqueue(async () => {
        const database = await openDb();
        const row = await database.getFirstAsync<Row>(`SELECT id, data FROM ${tableName} WHERE id = ?`, id);
        return row ? (JSON.parse(row.data) as T) : undefined;
      });
    },
    async put(record) {
      return enqueue(async () => {
        const database = await openDb();
        const id = (record as { id: string }).id;
        return database.runAsync(
          `INSERT OR REPLACE INTO ${tableName} (id, data) VALUES (?, ?)`,
          id,
          JSON.stringify(record)
        );
      });
    },
    async toArray() {
      return enqueue(async () => {
        const database = await openDb();
        const rows = await database.getAllAsync<Row>(`SELECT id, data FROM ${tableName}`);
        return rows.map((r) => JSON.parse(r.data) as T);
      });
    },
    async delete(id) {
      return enqueue(async () => {
        const database = await openDb();
        return database.runAsync(`DELETE FROM ${tableName} WHERE id = ?`, id);
      });
    },
    async count() {
      return enqueue(async () => {
        const database = await openDb();
        const row = await database.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${tableName}`);
        return row?.n ?? 0;
      });
    },
    async update(id, changes) {
      return enqueue(async () => {
        const database = await openDb();
        const existing = await database.getFirstAsync<Row>(`SELECT id, data FROM ${tableName} WHERE id = ?`, id);
        if (!existing) return undefined;
        const merged = { ...JSON.parse(existing.data), ...changes };
        return database.runAsync(`UPDATE ${tableName} SET data = ? WHERE id = ?`, JSON.stringify(merged), id);
      });
    },
    async clear() {
      return enqueue(async () => {
        const database = await openDb();
        return database.runAsync(`DELETE FROM ${tableName}`);
      });
    }
  };
}

// Explicit per-table typed properties (mirroring schema.ts's Dexie EntityTable<T,'id'> class fields) so
// callers like securityManager.ts (`(await db.security.toArray())[0]` typed as SecurityRecord) keep their
// real types instead of collapsing to `unknown` — only `tables` (below) is deliberately untyped, same as
// Dexie's own `Table<any>[]`.
const tableStores = {
  price_cache: makeRowStore<PriceCache>('price_cache'),
  privacy_stats: makeRowStore<PrivacyStat>('privacy_stats'),

  profile: makeRowStore<Profile>('profile'),
  holdings: makeRowStore<Holding>('holdings'),
  expenses: makeRowStore<Expense>('expenses'),
  expense_categories: makeRowStore<ExpenseCategory>('expense_categories'),
  budgets: makeRowStore<Budget>('budgets'),
  hashtags: makeRowStore<Hashtag>('hashtags'),
  goals: makeRowStore<Goal>('goals'),
  goal_contributions: makeRowStore<GoalContribution>('goal_contributions'),
  liabilities: makeRowStore<Liability>('liabilities'),
  insurance_policies: makeRowStore<InsurancePolicy>('insurance_policies'),
  chip_insights: makeRowStore<ChipInsight>('chip_insights'),
  ai_call_log: makeRowStore<AiCallLog>('ai_call_log'),
  security: makeRowStore<SecurityRecord>('security'),
  subscriptions: makeRowStore<Subscription>('subscriptions'),
  personal_ious: makeRowStore<PersonalIou>('personal_ious'),
  credit_profile: makeRowStore<CreditProfile>('credit_profile'),
  accounts: makeRowStore<Account>('accounts'),
  activity_log: makeRowStore<ActivityLog>('activity_log'),
  merchant_memory: makeRowStore<MerchantMemory>('merchant_memory'),
  transaction_templates: makeRowStore<TransactionTemplate>('transaction_templates'),
  persons: makeRowStore<Person>('persons'),
  ledger_entries: makeRowStore<LedgerEntry>('ledger_entries'),
  device_keys: makeRowStore<DeviceKey>('device_keys'),
  group_keys: makeRowStore<GroupKey>('group_keys'),
  sync_cursor: makeRowStore<SyncCursor>('sync_cursor'),
  groups: makeRowStore<Group>('groups'),
  group_members: makeRowStore<GroupMember>('group_members'),
  group_events: makeRowStore<GroupEvent>('group_events')
};

export const db = {
  ...tableStores,
  // Dexie's `db.tables` (used by securityManager.ts's wipeAllData()) — every RowStore, untyped, since all
  // that's needed is `.clear()`.
  tables: Object.values(tableStores) as RowStore<unknown>[]
};
