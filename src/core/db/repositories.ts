// Pre-instantiated encrypted repositories for all sensitive tables.
// Feature code imports from here — never from Dexie directly.
import { db } from './schema';
import { EncryptedRepository } from './repository';
import type {
  AiCallLog,
  Asset,
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
  Profile,
  Subscription
} from './types';

export const profileRepo = new EncryptedRepository<Profile>(db.profile as never);
export const holdingsRepo = new EncryptedRepository<Holding>(db.holdings as never);
export const expensesRepo = new EncryptedRepository<Expense>(db.expenses as never);
export const expenseCategoriesRepo = new EncryptedRepository<ExpenseCategory>(db.expense_categories as never);
export const budgetsRepo = new EncryptedRepository<Budget>(db.budgets as never);
export const hashtagsRepo = new EncryptedRepository<Hashtag>(db.hashtags as never);
export const goalsRepo = new EncryptedRepository<Goal>(db.goals as never);
export const goalContributionsRepo = new EncryptedRepository<GoalContribution>(db.goal_contributions as never);
export const assetsRepo = new EncryptedRepository<Asset>(db.assets as never);
export const liabilitiesRepo = new EncryptedRepository<Liability>(db.liabilities as never);
export const insurancePoliciesRepo = new EncryptedRepository<InsurancePolicy>(db.insurance_policies as never);
export const chipInsightsRepo = new EncryptedRepository<ChipInsight>(db.chip_insights as never);
export const aiCallLogRepo = new EncryptedRepository<AiCallLog>(db.ai_call_log as never);
export const subscriptionsRepo = new EncryptedRepository<Subscription>(db.subscriptions as never);
export const personalIousRepo = new EncryptedRepository<PersonalIou>(db.personal_ious as never);
export const creditProfileRepo = new EncryptedRepository<CreditProfile>(db.credit_profile as never);
