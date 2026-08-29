// Pre-instantiated encrypted repositories for all sensitive tables.
// Feature code imports from here — never from Dexie directly.
import { db, expensesIndexedStore } from './schema';
import { EncryptedRepository } from './repository';
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
  Profile,
  RetirementPlan,
  SmsAccountMapping,
  SmsExcludedSender,
  SmsTransactionRecord,
  Subscription,
  SyncCursor,
  TransactionTemplate
} from './types';

export const profileRepo = new EncryptedRepository<Profile>(db.profile as never);
export const holdingsRepo = new EncryptedRepository<Holding>(db.holdings as never);
// Tier 2 performance fix (2026-08-28) — the only repo constructed with indexed-query support (see
// `EncryptedRepository`'s own `indexed` doc comment and `store.ts`'s `ExpenseRowStore`). `fields()`
// derives the 5 plaintext index columns from the domain `Expense` on every `put()`; `type` defaults
// to `'expense'` matching this codebase's own convention for a legacy/omitted `Expense.type`.
export const expensesRepo = new EncryptedRepository<Expense>(db.expenses as never, {
  table: expensesIndexedStore,
  fields: (e) => ({
    date: e.date,
    ...(e.accountId !== undefined && { accountId: e.accountId }),
    ...(e.toAccountId !== undefined && { toAccountId: e.toAccountId }),
    categoryId: e.categoryId,
    type: e.type ?? 'expense'
  })
});
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
export const bankStatementImportsRepo = new EncryptedRepository<BankStatementImportRecord>(
  db.bank_statement_imports as never
);
export const bankNarrationOverridesRepo = new EncryptedRepository<BankNarrationOverride>(
  db.bank_narration_overrides as never
);
export const bankCashWithdrawalCodesRepo = new EncryptedRepository<BankCashWithdrawalCode>(
  db.bank_cash_withdrawal_codes as never
);
export const paymentModesRepo = new EncryptedRepository<PaymentMode>(db.payment_modes as never);
export const retirementPlanRepo = new EncryptedRepository<RetirementPlan>(db.retirement_plan as never);
export const netWorthSnapshotsRepo = new EncryptedRepository<NetWorthSnapshot>(db.net_worth_snapshots as never);
export const smsTransactionsRepo = new EncryptedRepository<SmsTransactionRecord>(db.sms_transactions as never);
export const smsAccountMappingsRepo = new EncryptedRepository<SmsAccountMapping>(db.sms_account_mappings as never);
export const smsExcludedSendersRepo = new EncryptedRepository<SmsExcludedSender>(db.sms_excluded_senders as never);

/** Every `EncryptedRepository` singleton above — kept as one array purely so
 *  `invalidateAllRepositoryCaches()` below can iterate all of them without hand-maintaining a second
 *  list; add any new repo to this array alongside its own `export const` line. */
const ALL_REPOS: Array<{ invalidateCache(): void }> = [
  profileRepo,
  holdingsRepo,
  expensesRepo,
  expenseCategoriesRepo,
  budgetsRepo,
  hashtagsRepo,
  goalsRepo,
  goalContributionsRepo,
  liabilitiesRepo,
  insurancePoliciesRepo,
  chipInsightsRepo,
  aiCallLogRepo,
  subscriptionsRepo,
  personalIousRepo,
  personsRepo,
  ledgerEntriesRepo,
  creditProfileRepo,
  accountsRepo,
  activityLogRepo,
  merchantMemoryRepo,
  transactionTemplatesRepo,
  deviceKeysRepo,
  groupKeysRepo,
  syncCursorRepo,
  groupsRepo,
  groupMembersRepo,
  groupEventsRepo,
  bankStatementImportsRepo,
  bankNarrationOverridesRepo,
  bankCashWithdrawalCodesRepo,
  paymentModesRepo,
  retirementPlanRepo,
  netWorthSnapshotsRepo,
  smsTransactionsRepo,
  smsAccountMappingsRepo,
  smsExcludedSendersRepo
];

/**
 * Must be called immediately after any write that bypasses every `EncryptedRepository` here and
 * touches the underlying `RowStore`/table directly — otherwise `EncryptedRepository`'s in-memory
 * cache (`repository.ts`, 2026-08-28) would keep serving pre-write data indefinitely. Audited as
 * exactly 4 such bypasses in the codebase: `securityManager.ts`'s `wipeAllData()` (raw
 * `db.tables.map(t => t.clear())`), `seedDemoData.ts`'s `wipeDemoData()` (raw per-table `.clear()`),
 * and `backupManager.ts`'s two raw-write paths — `importBackup`'s destructive restore
 * (`restoreTables()`) and `mergeBundle()`'s non-destructive sync/recovery merge (`table.put()` in a
 * loop). Every other write in the app already goes through some
 * `EncryptedRepository.put()`/`.delete()`, which keeps its own cache consistent on every call — no
 * broader invalidation needed there.
 */
export function invalidateAllRepositoryCaches(): void {
  for (const repo of ALL_REPOS) repo.invalidateCache();
}
