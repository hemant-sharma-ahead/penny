// Maps an activity-log `entityType` to a function that re-inserts a snapshotted record,
// so restoreActivity() can undo a delete generically across modules.
import {
  accountsRepo,
  budgetsRepo,
  expenseCategoriesRepo,
  expensesRepo,
  goalContributionsRepo,
  goalsRepo,
  holdingsRepo,
  insurancePoliciesRepo,
  liabilitiesRepo,
  personalIousRepo,
  subscriptionsRepo
} from './repositories';
import type {
  Account,
  Budget,
  Expense,
  ExpenseCategory,
  Goal,
  GoalContribution,
  Holding,
  InsurancePolicy,
  Liability,
  PersonalIou,
  Subscription
} from './types';

/** entityType → re-insert fn. The cast is safe: snapshots are serialised from the same type. */
export const RESTORE_PUT: Record<string, (record: unknown) => Promise<void>> = {
  expense: (r) => expensesRepo.put(r as Expense),
  category: (r) => expenseCategoriesRepo.put(r as ExpenseCategory),
  account: (r) => accountsRepo.put(r as Account),
  budget: (r) => budgetsRepo.put(r as Budget),
  goal: (r) => goalsRepo.put(r as Goal),
  goalContribution: (r) => goalContributionsRepo.put(r as GoalContribution),
  holding: (r) => holdingsRepo.put(r as Holding),
  insurance: (r) => insurancePoliciesRepo.put(r as InsurancePolicy),
  liability: (r) => liabilitiesRepo.put(r as Liability),
  iou: (r) => personalIousRepo.put(r as PersonalIou),
  subscription: (r) => subscriptionsRepo.put(r as Subscription)
};
