// Pure reconciliation of the goal contributions a transaction seeds (expense/income/transfer → goal
// linkage), plus the reverse: the account transaction that a goal contribution seeds. Mirrors
// `core/iou/expenseLink.ts` exactly — same shape of two-way link, same reconcile-on-edit guarantees
// (existing id/createdAt preserved so Undo/history stay stable), just simpler on the forward side since
// a goal link has no "kind" dimension the way lent/borrowed does (one relationship: "counts toward X").
import type { Expense, GoalContribution, TransactionType } from '@/core/db/types';

/** The optional goal intent attached to a transaction at save time (null ⇒ no goal link on this txn). */
export interface ExpenseGoalIntent {
  goalId: string;
  amount: number;
  date: number;
}

export interface GoalContributionReconcile {
  /** Contributions to upsert. */
  toPut: GoalContribution[];
  /** Contribution ids to delete. */
  toDelete: string[];
}

/**
 * Reconcile the goal contribution linked to one transaction against its new intent.
 *
 * @param txnId    the Expense/Income/Transfer whose goal link is being reconciled
 * @param existing all goal contributions in scope (the helper filters to this txn's own linked
 *                 contribution — any origin, see below — so callers can pass every contribution)
 * @param intent   the new goal intent, or null if the transaction no longer links to a goal
 * @param nowMs    current time for timestamps
 *
 * Pure: the caller persists `toPut` / `toDelete`. If the goal selection is unchanged, the existing
 * contribution's id and createdAt are preserved (Undo/history stay stable across edits); switching to a
 * different goal deletes the old contribution and creates a fresh one on the new goal instead of moving
 * it in place, since a contribution's identity is meant to represent "this txn counts toward goal X" —
 * changing X is a delete+recreate, not an edit of the same fact.
 *
 * **Origin-agnostic matching (same bug fix as `core/iou/expenseLink.ts`'s `reconcileExpenseLink`,
 * 2026-08-26).** `seeded` used to only match `origin === 'expense'` — a transaction whose goal link
 * was created manually (`useGoals.ts`'s `linkTransaction`/contribution flow, `origin: 'manual'`) was
 * invisible here, so editing that transaction never resynced the contribution, and re-linking it to
 * a goal from the expense side created a duplicate contribution instead of finding the existing one.
 * Matching on `linkedTxnId` alone (any origin) fixes both; `origin` is preserved from the existing
 * contribution rather than forced to `'expense'`, so origin-dependent UI (`GoalDetailView.tsx`'s
 * `editable = c.origin === 'manual'`) keeps behaving correctly. */
export function reconcileGoalLink(
  txnId: string,
  existing: GoalContribution[],
  intent: ExpenseGoalIntent | null,
  nowMs: number
): GoalContributionReconcile {
  const seeded = existing.filter((c) => c.linkedTxnId === txnId);

  if (!intent) {
    return { toPut: [], toDelete: seeded.map((c) => c.id) };
  }

  const keep = seeded.find((c) => c.goalId === intent.goalId);
  const extras = seeded.filter((c) => c.id !== keep?.id);

  const contribution: GoalContribution = {
    id: keep?.id ?? crypto.randomUUID(),
    goalId: intent.goalId,
    amount: intent.amount,
    date: intent.date,
    origin: keep?.origin ?? 'expense',
    linkedTxnId: txnId,
    createdAt: keep?.createdAt ?? nowMs,
    updatedAt: nowMs
  };

  return { toPut: [contribution], toDelete: extras.map((c) => c.id) };
}

// ── Reverse direction: goal contribution → linked account transaction ───────────────────────

/** The desired state of the account transaction linked to a goal contribution. */
export interface LinkedGoalTxnIntent {
  /** Whether a linked account transaction should exist after this reconcile. */
  record: boolean;
  /** Which account the contribution came from. */
  sourceAccountId: string;
  /** If set, records a Transfer (source → destination) instead of an Expense out of source alone —
   *  per your call: a destination account means a real transfer between accounts, no destination
   *  means a plain expense (money set aside, not moved to a separately-tracked account). */
  destinationAccountId?: string;
  amount: number;
  date: number;
  description: string;
}

export interface LinkedGoalTxnReconcile {
  /** Transaction to upsert (create or update in place), if the link should exist. */
  put?: Expense;
  /** Existing linked transaction id to delete (when the link is being removed). */
  deleteId?: string;
}

/**
 * Reconcile the account transaction that records a goal contribution's real money movement against new
 * intent. Mirror of {@link reconcileLinkedTxn} in `core/iou/expenseLink.ts` for the reverse direction, so
 * editing a manual contribution (amount / date / account / transfer destination) re-syncs its linked
 * transaction, and toggling the link off deletes it.
 *
 * Pure: the caller persists `put` / `deleteId`. The existing transaction's id and createdAt are
 * preserved across edits; a user-set category is kept only while the transaction type (expense vs
 * transfer) is unchanged — adding/removing a destination account flips the type and resets to the
 * default category, same "direction flip resets category" rule `reconcileLinkedTxn` uses for lent↔borrowed.
 */
export function reconcileLinkedGoalTxn(
  existing: Expense | null,
  intent: LinkedGoalTxnIntent,
  nowMs: number
): LinkedGoalTxnReconcile {
  if (!intent.record || !intent.sourceAccountId) {
    return existing ? { deleteId: existing.id } : {};
  }
  const isTransfer = !!intent.destinationAccountId;
  const type: TransactionType = isTransfer ? 'transfer' : 'expense';
  const defaultCategory = isTransfer ? 'cat-tr-bank' : 'cat-savings';
  const txn: Expense = {
    id: existing?.id ?? crypto.randomUUID(),
    amount: intent.amount,
    categoryId: existing && existing.type === type ? existing.categoryId : defaultCategory,
    description: intent.description,
    date: intent.date,
    hashtags: existing?.hashtags ?? [],
    isRecurring: false,
    type,
    accountId: intent.sourceAccountId,
    source: 'manual',
    createdAt: existing?.createdAt ?? nowMs,
    updatedAt: nowMs
  };
  if (intent.destinationAccountId) txn.toAccountId = intent.destinationAccountId;
  if (existing?.notes) txn.notes = existing.notes;
  if (existing?.paymentMode) txn.paymentMode = existing.paymentMode;
  return { put: txn };
}
