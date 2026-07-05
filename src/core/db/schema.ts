import Dexie, { type EntityTable } from 'dexie';
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

export class PennyDatabase extends Dexie {
  // ─── Plain stores ───────────────────────────────────────────────────────────
  price_cache!: EntityTable<PriceCache, 'id'>;
  privacy_stats!: EntityTable<PrivacyStat, 'id'>;

  // ─── Encrypted stores ───────────────────────────────────────────────────────
  profile!: EntityTable<Profile, 'id'>;
  holdings!: EntityTable<Holding, 'id'>;
  expenses!: EntityTable<Expense, 'id'>;
  expense_categories!: EntityTable<ExpenseCategory, 'id'>;
  budgets!: EntityTable<Budget, 'id'>;
  hashtags!: EntityTable<Hashtag, 'id'>;
  goals!: EntityTable<Goal, 'id'>;
  goal_contributions!: EntityTable<GoalContribution, 'id'>;
  liabilities!: EntityTable<Liability, 'id'>;
  insurance_policies!: EntityTable<InsurancePolicy, 'id'>;
  chip_insights!: EntityTable<ChipInsight, 'id'>;
  ai_call_log!: EntityTable<AiCallLog, 'id'>;
  security!: EntityTable<SecurityRecord, 'id'>;
  subscriptions!: EntityTable<Subscription, 'id'>;
  personal_ious!: EntityTable<PersonalIou, 'id'>;
  credit_profile!: EntityTable<CreditProfile, 'id'>;
  accounts!: EntityTable<Account, 'id'>;
  activity_log!: EntityTable<ActivityLog, 'id'>;
  merchant_memory!: EntityTable<MerchantMemory, 'id'>;
  transaction_templates!: EntityTable<TransactionTemplate, 'id'>;
  persons!: EntityTable<Person, 'id'>;
  ledger_entries!: EntityTable<LedgerEntry, 'id'>;
  device_keys!: EntityTable<DeviceKey, 'id'>;
  group_keys!: EntityTable<GroupKey, 'id'>;
  sync_cursor!: EntityTable<SyncCursor, 'id'>;
  groups!: EntityTable<Group, 'id'>;
  group_members!: EntityTable<GroupMember, 'id'>;
  group_events!: EntityTable<GroupEvent, 'id'>;

  constructor() {
    super('penny');

    this.version(1).stores({
      // Plain stores — indexed fields only (no PII)
      price_cache: 'id, symbol, fetchedAt',
      privacy_stats: 'id, domain',

      // Encrypted stores — only id indexed; all field data is ciphertext
      // Secondary indexes on encrypted stores would leak information, so we index id only.
      // Queries requiring filtering must decrypt in application layer.
      profile: 'id',
      holdings: 'id',
      expenses: 'id',
      expense_categories: 'id',
      budgets: 'id',
      hashtags: 'id',
      goals: 'id',
      goal_contributions: 'id',
      assets: 'id',
      liabilities: 'id',
      insurance_policies: 'id',
      chip_insights: 'id',
      ai_call_log: 'id',
      security: 'id',
      subscriptions: 'id',
      personal_ious: 'id',
      credit_profile: 'id'
    });

    // v2 — adds accounts store for multi-account tracking (M9)
    this.version(2).stores({
      accounts: 'id'
    });

    // v3 — drops legacy assets store (superseded by holdings with assetClass) (M11 step 69)
    this.version(3).stores({ assets: null });

    // v4 — activity log for the Timeline (Pre-Phase 1.5, Track 4). Encrypted; id-only index.
    this.version(4).stores({ activity_log: 'id' });

    // v5 — merchant memory for transaction auto-fill (Pre-Phase 1.5, Track 6). Encrypted; id-only index.
    this.version(5).stores({ merchant_memory: 'id' });

    // v6 — saved transaction templates/favorites (Pre-Phase 1.5, Track 6 Step 10). Encrypted; id-only index.
    this.version(6).stores({ transaction_templates: 'id' });

    // v7 — person-centric IOU ledger (Phase 1.5 Track 1). Encrypted; id-only index.
    // No .upgrade(): encrypted stores can't be transformed here (the hook runs pre-unlock and sees
    // only ciphertext). Legacy `personal_ious` → persons/ledger_entries migration is a post-unlock
    // backfill in useIou.ts (flag `penny_iou_v2`); `personal_ious` is kept for one release.
    this.version(7).stores({ persons: 'id', ledger_entries: 'id' });

    // v8 — sync/identity crypto stores (Phase 1.5 Track B): device keypairs, per-group keys,
    // and sync cursors. Encrypted; id-only index. No .upgrade() (encrypted; runs pre-unlock).
    // Start empty and are populated post-unlock at claim, so no backfill is needed.
    this.version(8).stores({ device_keys: 'id', group_keys: 'id', sync_cursor: 'id' });

    // v9 — Groups & Household OS (Phase 1.5 Track E): local decrypted mirrors of the server-relayed
    // group data (groups the user belongs to, their members, and the append-only shared-ledger events).
    // Encrypted; id-only index. No .upgrade() (encrypted; runs pre-unlock). Populated post-unlock via
    // the groups worker, so no backfill is needed.
    this.version(9).stores({ groups: 'id', group_members: 'id', group_events: 'id' });
  }
}

export const db = new PennyDatabase();
