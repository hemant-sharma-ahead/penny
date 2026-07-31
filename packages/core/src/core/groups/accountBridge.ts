// The account bridge (Phase 1.5 Track E — a locked mockup decision, screens 4/6): the ONLY link
// between a group's shared ledger and your personal money. Optionally records the real cash movement
// (a shared expense you paid → money out; a settlement received → money in) as a personal transaction
// on a chosen account. Group balances / "who owes whom" NEVER reflect into the personal IOU ledger —
// this one-way, opt-in txn is the sole crossover.
import { expensesRepo } from '@/core/db/repositories';
import { logActivity } from '@/core/db/activityLog';
import type { Expense } from '@/core/db/types';

export interface AccountBridgeInput {
  /** true ⇒ money came in (income, e.g. a settlement received); false ⇒ money went out (expense). */
  moneyIn: boolean;
  amount: number;
  accountId: string;
  description: string;
  /** Preferred category; falls back to a sensible reimbursement/other default. */
  categoryId?: string | undefined;
  /** Marks the personal txn as belonging to this group (row tint + de-dupe on the group side). */
  groupId?: string | undefined;
  date?: number | undefined;
}

/**
 * Record a personal account transaction for a group cash movement. Returns the created txn id.
 * Mirrors the IOU→account linkage ({@link reconcileLinkedTxn}) so the two bridges behave alike.
 */
export async function recordGroupAccountTxn(input: AccountBridgeInput): Promise<string> {
  const now = Date.now();
  const type = input.moneyIn ? 'income' : 'expense';
  const defaultCategory = input.moneyIn ? 'cat-inc-reimbursement' : 'cat-other';
  const txn: Expense = {
    id: crypto.randomUUID(),
    amount: input.amount,
    categoryId: input.categoryId || defaultCategory,
    description: input.description,
    date: input.date ?? now,
    hashtags: [],
    isRecurring: false,
    type,
    accountId: input.accountId,
    ...(input.groupId ? { shareWith: [input.groupId] } : {}),
    source: 'manual',
    createdAt: now,
    updatedAt: now
  };
  await expensesRepo.put(txn);
  logActivity({ action: 'CREATE', entityType: 'expense', entityId: txn.id, summary: input.description });
  return txn.id;
}
