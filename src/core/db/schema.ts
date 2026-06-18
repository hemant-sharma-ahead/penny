import Dexie, { type EntityTable } from 'dexie';
import type {
  Account,
  AiCallLog,
  Budget,
  ChipInsight,
  CreditProfile,
  Expense,
  ExpenseCategory,
  Goal,
  GoalContribution,
  Hashtag,
  Holding,
  InsurancePolicy,
  Liability,
  PersonalIou,
  PriceCache,
  PrivacyStat,
  Profile,
  SecurityRecord,
  Subscription
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
  }
}

export const db = new PennyDatabase();
