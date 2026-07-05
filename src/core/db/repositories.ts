// Pre-instantiated encrypted repositories for all sensitive tables.
// Feature code imports from here — never from Dexie directly.
import { db } from './schema';
import { EncryptedRepository } from './repository';
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
  Profile,
  Subscription,
  SyncCursor,
  TransactionTemplate
} from './types';

export const profileRepo = new EncryptedRepository<Profile>(db.profile as never);
export const holdingsRepo = new EncryptedRepository<Holding>(db.holdings as never);
export const expensesRepo = new EncryptedRepository<Expense>(db.expenses as never);
export const expenseCategoriesRepo = new EncryptedRepository<ExpenseCategory>(db.expense_categories as never);
export const budgetsRepo = new EncryptedRepository<Budget>(db.budgets as never);
export const hashtagsRepo = new EncryptedRepository<Hashtag>(db.hashtags as never);
export const goalsRepo = new EncryptedRepository<Goal>(db.goals as never);
export const goalContributionsRepo = new EncryptedRepository<GoalContribution>(db.goal_contributions as never);
export const liabilitiesRepo = new EncryptedRepository<Liability>(db.liabilities as never);
export const insurancePoliciesRepo = new EncryptedRepository<InsurancePolicy>(db.insurance_policies as never);
export const chipInsightsRepo = new EncryptedRepository<ChipInsight>(db.chip_insights as never);
export const aiCallLogRepo = new EncryptedRepository<AiCallLog>(db.ai_call_log as never);
export const subscriptionsRepo = new EncryptedRepository<Subscription>(db.subscriptions as never);
export const personalIousRepo = new EncryptedRepository<PersonalIou>(db.personal_ious as never);
export const personsRepo = new EncryptedRepository<Person>(db.persons as never);
export const ledgerEntriesRepo = new EncryptedRepository<LedgerEntry>(db.ledger_entries as never);
export const creditProfileRepo = new EncryptedRepository<CreditProfile>(db.credit_profile as never);
export const accountsRepo = new EncryptedRepository<Account>(db.accounts as never);
export const activityLogRepo = new EncryptedRepository<ActivityLog>(db.activity_log as never);
export const merchantMemoryRepo = new EncryptedRepository<MerchantMemory>(db.merchant_memory as never);
export const transactionTemplatesRepo = new EncryptedRepository<TransactionTemplate>(db.transaction_templates as never);
export const deviceKeysRepo = new EncryptedRepository<DeviceKey>(db.device_keys as never);
export const groupKeysRepo = new EncryptedRepository<GroupKey>(db.group_keys as never);
export const syncCursorRepo = new EncryptedRepository<SyncCursor>(db.sync_cursor as never);
export const groupsRepo = new EncryptedRepository<Group>(db.groups as never);
export const groupMembersRepo = new EncryptedRepository<GroupMember>(db.group_members as never);
export const groupEventsRepo = new EncryptedRepository<GroupEvent>(db.group_events as never);
