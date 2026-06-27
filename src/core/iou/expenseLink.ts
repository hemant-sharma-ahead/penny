// Pure reconciliation of the ledger entries that an expense seeds (expense → IOU linkage),
// plus the reverse: the account transaction that an IOU entry / settlement seeds (IOU → expense).
// Keeps both cascades (create / edit / delete) deterministic and unit-testable.
import type { Expense, LedgerEntry } from '@/core/db/types';

/** The optional IOU intent attached to an expense at save time (null ⇒ no IOU on this expense). */
export interface ExpenseIouIntent {
  personId: string;
  kind: 'lent' | 'borrowed';
  amount: number;
  date: number;
  description?: string;
}

/**
 * What the expense form surfaces to seed an IOU: the person is named (resolved to a `personId` at
 * save time by the hook), avoiding any cross-feature import of the IOU person picker.
 */
export interface ExpenseSeedIntent {
  personName: string;
  kind: 'lent' | 'borrowed';
  amount: number;
  date: number;
  description?: string;
}

export interface LedgerReconcile {
  /** Ledger entries to upsert. */
  toPut: LedgerEntry[];
  /** Ledger-entry ids to delete. */
  toDelete: string[];
}

/**
 * Reconcile the ledger entries linked to one transaction against its new intent.
 *
 * @param txnId     the Expense/Income whose IOU link is being reconciled
 * @param existing  all ledger entries in scope (the helper filters to this txn's own linked
 *                  expense-origin entries, so callers can pass the whole ledger)
 * @param intent    the new IOU intent, or null if the transaction no longer has an IOU
 * @param nowMs     current time for timestamps
 *
 * Pure: the caller persists `toPut` / `toDelete`. The first existing linked entry's id and
 * createdAt are preserved so Undo/history stay stable across edits; any extra linked entries
 * (defensive — there should be at most one for the v1 2-party case) are deleted.
 */
export function reconcileExpenseLink(
  txnId: string,
  existing: LedgerEntry[],
  intent: ExpenseIouIntent | null,
  nowMs: number
): LedgerReconcile {
  const seeded = existing.filter((e) => e.origin === 'expense' && e.linkedTxnId === txnId);

  if (!intent) {
    return { toPut: [], toDelete: seeded.map((e) => e.id) };
  }

  const [keep, ...extras] = seeded;
  const entry: LedgerEntry = {
    id: keep?.id ?? crypto.randomUUID(),
    personId: intent.personId,
    kind: intent.kind,
    amount: intent.amount,
    date: intent.date,
    origin: 'expense',
    linkedTxnId: txnId,
    createdAt: keep?.createdAt ?? nowMs,
    updatedAt: nowMs
  };
  if (intent.description) entry.description = intent.description;

  return { toPut: [entry], toDelete: extras.map((e) => e.id) };
}

// ── Reverse direction: IOU entry / settlement → linked account transaction ──────────────────

/** The desired state of the account transaction linked to a ledger entry (lent/borrowed or settlement). */
export interface LinkedTxnIntent {
  /** Whether a linked account transaction should exist after this reconcile. */
  record: boolean;
  /** Which account the money moved on. */
  accountId: string;
  amount: number;
  date: number;
  /** true ⇒ money came in (income); false ⇒ money went out (expense). */
  moneyIn: boolean;
  description: string;
}

export interface LinkedTxnReconcile {
  /** Transaction to upsert (create or update in place), if the link should exist. */
  put?: Expense;
  /** Existing linked transaction id to delete (when the link is being removed). */
  deleteId?: string;
}

/**
 * Reconcile the account transaction that records an IOU entry's real money movement against new
 * intent. Mirror of {@link reconcileExpenseLink} for the reverse direction so editing an IOU entry
 * (amount / date / account / direction) re-syncs its linked transaction, and toggling the link off
 * deletes it.
 *
 * Pure: the caller persists `put` / `deleteId`. The existing transaction's id and createdAt are
 * preserved across edits; a user-set category is kept only while the money direction is unchanged
 * (a lent⇄borrowed flip swaps expense⇄income and resets to the default category).
 */
export function reconcileLinkedTxn(
  existing: Expense | null,
  intent: LinkedTxnIntent,
  nowMs: number
): LinkedTxnReconcile {
  if (!intent.record || !intent.accountId) {
    return existing ? { deleteId: existing.id } : {};
  }
  const type = intent.moneyIn ? 'income' : 'expense';
  const defaultCategory = intent.moneyIn ? 'cat-inc-other' : 'cat-other';
  const txn: Expense = {
    id: existing?.id ?? crypto.randomUUID(),
    amount: intent.amount,
    categoryId: existing && existing.type === type ? existing.categoryId : defaultCategory,
    description: intent.description,
    date: intent.date,
    hashtags: existing?.hashtags ?? [],
    isRecurring: false,
    type,
    accountId: intent.accountId,
    source: 'manual',
    createdAt: existing?.createdAt ?? nowMs,
    updatedAt: nowMs
  };
  if (existing?.notes) txn.notes = existing.notes;
  if (existing?.paymentMode) txn.paymentMode = existing.paymentMode;
  return { put: txn };
}
