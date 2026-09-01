import { expensesRepo, insurancePoliciesRepo } from '@/core/db/repositories';
import { logActivity } from '@/core/db/activityLog';
import { notifyTxnChanged } from '@/hooks/useTxnRefresh';
import { applyMarkAsPaid, applyUnmarkPayment, installmentAmount } from '@/core/insurance/premiumSchedule';
import { buildPremiumExpense, findCandidateExpenses } from '@/core/insurance/expenseLinking';
import type { Expense, InsurancePolicy } from '@/core/db/types';

/** The real default category (`packages/core/src/core/db/defaultCategories.ts`) every "Log a new
 *  expense" mark-as-paid choice files under — never invented, matches insurance-redesign-v4.html §④. */
export const INSURANCE_PREMIUM_CATEGORY_ID = 'cat-insurance-premium';

export type MarkPaidChoice = { kind: 'log' } | { kind: 'link'; expenseId: string } | { kind: 'skip' };

/**
 * Shared "Mark as paid" mutation (insurance-redesign-v4.html §④) — lives in `~/hooks/`, not
 * `features/insurance/`, specifically so both `features/insurance/useInsurance.ts` (the Insurance
 * screen's own hook instance) and `~/hooks/useReminders.ts` (a completely separate hook instance
 * backing the header bell) can call the exact same real repo write, mirroring this codebase's
 * established "promote to hooks/ for cross-consumption" convention (see e.g. `useAccountForm.ts`'s own
 * doc comment) rather than one feature importing another feature's hook (an architecture-rule
 * violation) or duplicating the write twice. Persists directly via the repos — every caller already
 * subscribes to `useTxnRefresh()` for the async catch-up, and should also update its own local state /
 * call `reload()` for immediate consistency (same "defense in depth" pattern `useGoals.ts`'s
 * `syncLinkedGoalTxn` documents).
 */
export async function markPremiumPaid(
  policy: InsurancePolicy,
  choice: MarkPaidChoice,
  paidMs: number = Date.now()
): Promise<{ policy: InsurancePolicy; expense?: Expense }> {
  const dueMs = policy.nextPremiumDueDate ?? paidMs;
  const amount = installmentAmount(policy, dueMs);
  const label = policy.planName ?? policy.insurer;

  let linkedExpenseId: string | undefined;
  let expense: Expense | undefined;

  if (choice.kind === 'log') {
    expense = buildPremiumExpense(label, amount, dueMs, INSURANCE_PREMIUM_CATEGORY_ID);
    await expensesRepo.put(expense);
    logActivity({
      action: 'CREATE',
      entityType: 'expense',
      entityId: expense.id,
      summary: `Added expense: ${expense.description} ₹${expense.amount}`
    });
    linkedExpenseId = expense.id;
  } else if (choice.kind === 'link') {
    linkedExpenseId = choice.expenseId;
  }

  const patch = applyMarkAsPaid(policy, paidMs, linkedExpenseId);
  const updated: InsurancePolicy = { ...policy, ...patch, updatedAt: Date.now() };
  await insurancePoliciesRepo.put(updated);
  logActivity({
    action: 'UPDATE',
    entityType: 'insurance',
    entityId: policy.id,
    summary: `Marked premium paid: ${label} ₹${amount}`
  });
  notifyTxnChanged();
  return { policy: updated, ...(expense ? { expense } : {}) };
}

/**
 * Reverses the most recent "Mark as paid" (see `applyUnmarkPayment`'s own "most recent only" doc
 * comment). `alsoRemoveExpense` is the caller's ALREADY-CONFIRMED answer to the "also remove/unlink
 * that expense?" `ConfirmDialog` — this function performs no confirmation itself, it only acts on the
 * decision. Returns `null` if `paymentId` isn't the top-of-history entry.
 */
export async function unmarkLastPremiumPayment(
  policy: InsurancePolicy,
  paymentId: string,
  alsoRemoveExpense: boolean
): Promise<InsurancePolicy | null> {
  const result = applyUnmarkPayment(policy, paymentId);
  if (!result) return null;
  const { premiumPayments, nextPremiumDueDate, removed } = result;
  const updated: InsurancePolicy = {
    ...policy,
    premiumPayments,
    nextPremiumDueDate,
    nextPremiumDueDateIsCustom: false,
    updatedAt: Date.now()
  };
  await insurancePoliciesRepo.put(updated);
  logActivity({
    action: 'UPDATE',
    entityType: 'insurance',
    entityId: policy.id,
    summary: `Un-marked a premium payment: ${policy.planName ?? policy.insurer}`
  });
  if (removed.linkedExpenseId && alsoRemoveExpense) {
    await expensesRepo.delete(removed.linkedExpenseId);
    logActivity({
      action: 'DELETE',
      entityType: 'expense',
      entityId: removed.linkedExpenseId,
      summary: 'Deleted expense linked to an un-marked premium payment'
    });
  }
  notifyTxnChanged();
  return updated;
}

/** Up to 3 plausible already-recorded expenses to offer for "Link an existing expense" — a lightweight
 *  date/amount-proximity heuristic (insurance-redesign-v4.html §④), not a full search. */
export async function candidateExpensesForPolicy(policy: InsurancePolicy): Promise<Expense[]> {
  const dueMs = policy.nextPremiumDueDate ?? Date.now();
  const amount = installmentAmount(policy, dueMs);
  const all = await expensesRepo.getAll();
  const alreadyLinked = new Set(
    (policy.premiumPayments ?? []).map((p) => p.linkedExpenseId).filter((id): id is string => !!id)
  );
  return findCandidateExpenses(all, dueMs, amount, alreadyLinked);
}
