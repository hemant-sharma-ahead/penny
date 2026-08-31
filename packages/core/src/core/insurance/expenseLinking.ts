import type { Expense } from '@/core/db/types';

// "Mark as paid" → optional expense-linking (insurance-redesign-v4.html §④) — pure helpers for the two
// non-"Skip" choices. The hook layer (`useInsurance.ts`/`useReminders.ts`'s shared premium-action
// module) persists whatever these return.

const DAY_MS = 86_400_000;

/**
 * Suggests plausible already-recorded expenses to link to a just-paid premium installment — a
 * lightweight "near this amount/date" heuristic, explicitly NOT a full search UI (per the mockup's own
 * scope note: "a reasonable v1 heuristic"). Excludes transfers and anything in `excludeExpenseIds`
 * (already linked to a different premium payment). Ranked by date proximity to `dueMs` first, then
 * amount proximity to `amount`.
 */
export function findCandidateExpenses(
  expenses: Expense[],
  dueMs: number,
  amount: number,
  excludeExpenseIds: ReadonlySet<string>,
  limit = 3,
  windowDays = 10
): Expense[] {
  const windowMs = windowDays * DAY_MS;
  return expenses
    .filter((e) => (e.type ?? 'expense') !== 'transfer')
    .filter((e) => !excludeExpenseIds.has(e.id))
    .filter((e) => Math.abs(e.date - dueMs) <= windowMs)
    .sort((a, b) => {
      const dateDiff = Math.abs(a.date - dueMs) - Math.abs(b.date - dueMs);
      if (dateDiff !== 0) return dateDiff;
      return Math.abs(a.amount - amount) - Math.abs(b.amount - amount);
    })
    .slice(0, limit);
}

/**
 * Builds the pre-filled `Expense` the "Log a new expense" mark-as-paid choice saves — description =
 * plan name (falling back to insurer) + "premium", amount = the exact discount-aware installment just
 * paid, category = whatever real default category id the caller passes (`cat-insurance-premium` /
 * "Insurance Premium" in practice — never invented here, this file has no default-category knowledge
 * of its own).
 */
export function buildPremiumExpense(
  planNameOrInsurer: string,
  amount: number,
  dateMs: number,
  categoryId: string
): Expense {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    amount,
    categoryId,
    description: `${planNameOrInsurer} premium`,
    date: dateMs,
    hashtags: [],
    isRecurring: false,
    type: 'expense',
    source: 'manual',
    createdAt: now,
    updatedAt: now
  };
}
