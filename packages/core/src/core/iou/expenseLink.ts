// Pure reconciliation of the ledger entries that an expense seeds (expense → IOU linkage),
// plus the reverse: the account transaction that an IOU entry / settlement seeds (IOU → expense).
// Keeps both cascades (create / edit / delete) deterministic and unit-testable.
import type { Expense, LedgerEntry, LedgerKind, SettleDirection } from '@/core/db/types';

/** The optional IOU intent attached to an expense at save time (null ⇒ no IOU on this expense).
 *  `settleDirection` only applies (and is only ever set) when `kind === 'settlement'` — see
 *  `kindForIouCategory` (`core/iou/ledger.ts`), which is what actually derives these two together
 *  from the real category the user picked. */
export interface ExpenseIouIntent {
  personId: string;
  kind: LedgerKind;
  settleDirection?: SettleDirection;
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
  kind: LedgerKind;
  settleDirection?: SettleDirection;
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
 *                  entries — any origin, see below — so callers can pass the whole ledger)
 * @param intent    the new IOU intent, or null if the transaction no longer has an IOU
 * @param nowMs     current time for timestamps
 *
 * Pure: the caller persists `toPut` / `toDelete`. The first existing linked entry's id and
 * createdAt are preserved so Undo/history stay stable across edits; any extra linked entries
 * (defensive — there should be at most one for the v1 2-party case) are deleted.
 *
 * **Origin-agnostic matching (bug fix, 2026-08-26).** `seeded` used to only match `origin ===
 * 'expense'` entries — meaning an expense whose IOU link was originally created the OTHER way
 * (the Add IOU popup / `EntryForm.tsx`, `origin: 'manual'`) was invisible to this function: editing
 * that expense's description/amount from the Transactions tab silently did nothing (the entry
 * never resynced), and changing its category to an IOU category created a brand-new SECOND ledger
 * entry instead of finding and updating the existing one — a real, reported duplicate-entry bug.
 * Matching on `linkedTxnId` alone, regardless of origin, fixes both: there is now exactly one
 * ledger entry per linked transaction, kept in sync from whichever side edits it. `origin` itself
 * is preserved from the existing entry (not forced to `'expense'`) so origin-dependent UI elsewhere
 * (`EntryForm.tsx`'s `canRecord`, `PersonLedgerView.tsx`'s row-editable check — both gate on
 * `origin === 'manual'` meaning "the IOU side still owns this") keeps behaving correctly for an
 * entry that started as a manual Add-IOU entry and simply gets touched by an expense edit later. */
export function reconcileExpenseLink(
  txnId: string,
  existing: LedgerEntry[],
  intent: ExpenseIouIntent | null,
  nowMs: number
): LedgerReconcile {
  const seeded = existing.filter((e) => e.linkedTxnId === txnId);

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
    origin: keep?.origin ?? 'expense',
    linkedTxnId: txnId,
    createdAt: keep?.createdAt ?? nowMs,
    updatedAt: nowMs
  };
  if (intent.kind === 'settlement' && intent.settleDirection) entry.settleDirection = intent.settleDirection;
  if (intent.description) entry.description = intent.description;

  return { toPut: [entry], toDelete: extras.map((e) => e.id) };
}

/** Given a lent/borrowed/settlement `LedgerEntry`, resolves which way the money actually moves and
 *  which of the 4 real IOU categories a linked transaction should default to — one place for this
 *  decision, used by both a new lent/borrowed entry (`EntryForm.tsx`'s "Add IOU" popup, which
 *  previously never passed a `defaultCategoryId` at all, silently landing every entry on the generic
 *  Other/Other Income fallback — found 2026-08-26) and a settlement (`IouView.tsx`'s `handleSettle`,
 *  which already computed this inline before this helper existed). `kind`/`settleDirection` alone
 *  fully determine this — no other input needed. */
export function directionForLedgerEntry(entry: Pick<LedgerEntry, 'kind' | 'settleDirection'>): {
  moneyIn: boolean;
  defaultCategoryId: string;
} {
  if (entry.kind === 'borrowed') return { moneyIn: true, defaultCategoryId: 'cat-inc-borrowed' };
  if (entry.kind === 'lent') return { moneyIn: false, defaultCategoryId: 'cat-lending' };
  // Settlement — direction comes from `settleDirection`, not `kind` (both settlement sub-cases share
  // the same `kind: 'settlement'`).
  return entry.settleDirection === 'they_paid_you'
    ? { moneyIn: true, defaultCategoryId: 'cat-collected-money' }
    : { moneyIn: false, defaultCategoryId: 'cat-return-borrowed' };
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
  /** Overrides the fallback default category for a brand-new linked transaction (an edit still keeps
   *  whatever category the user already set, same as the plain fallback). Used by the settle flow
   *  (2026-08-06) to land on "Collected Money"/"Return Borrowed" instead of the generic Other/Other
   *  Income a settlement would otherwise get — omit to keep that generic fallback (e.g. the original
   *  lent/borrowed entry's own linked transaction, unrelated to settling). */
  defaultCategoryId?: string;
  /** How the money moved (cash/UPI/card/etc.) — `EntryForm.tsx`/`SettleUpModal.tsx`'s own
   *  `PaymentModeChips`, same field `ExpenseForm.tsx` already sets on every regular transaction.
   *  Omit to leave it alone (an edit keeps whatever the linked transaction already had). */
  paymentMode?: string;
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
  const defaultCategory = intent.defaultCategoryId ?? (intent.moneyIn ? 'cat-inc-other' : 'cat-other');
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
  // An explicit `intent.paymentMode` (the user's own chip pick) always wins; otherwise preserve
  // whatever the existing linked transaction already had, same fallback as every other
  // untouched-on-this-edit field above.
  if (intent.paymentMode) txn.paymentMode = intent.paymentMode;
  else if (existing?.paymentMode) txn.paymentMode = existing.paymentMode;
  return { put: txn };
}
