import type { BankStatementImportRecord, Expense, ImportBatchSummary } from '@/core/db/types';
import { delta } from '@/core/accounts/balanceCalculator';
import { toDateKey } from '@/lib/date';
import { reconcileMatchedExpense } from './checkpoint';
import { normalizeNarration } from './normalization';
import type { ParsedStatementRow, StatementLineDirection } from './types';

/**
 * Full Ledger Phase 2 (`docs/plans/bank-reconciliation-ledger.md`) — relink/unmatch a `'matched'` row,
 * and resolve a `'skipped-unresolved'` row to an existing transaction. Pure, no I/O, mirroring
 * `checkpoint.ts`'s own convention (callers own the actual repo writes). "Add as a new transaction"
 * for a skipped row needs no dedicated function here — it's the ordinary `ExpenseForm`/
 * `saveExpenseWithHashtags` path with a `statementPreset`, then {@link buildResolvedImportRecord} for
 * the linking record afterward.
 */

/** Strips the two checkpoint-only fields off an `Expense` — via omission, not `field: undefined`,
 *  since `exactOptionalPropertyTypes` (this package's tsconfig) treats an optional field as "absent or
 *  the real type," never "explicitly set to `undefined`." Only called for the account that actually
 *  OWNED the checkpoint (`expense.accountId === accountId`) — a transfer's `toAccountId`-only side
 *  never carried one to begin with (same guard `checkpoint.ts`'s own functions use). */
function removeCheckpointFields(expense: Expense, now: number): Expense {
  const { statementBalance: _statementBalance, reconciledSeq: _reconciledSeq, ...rest } = expense;
  void _statementBalance;
  void _reconciledSeq;
  return { ...rest, updatedAt: now };
}

export interface UnmatchResult {
  /** The formerly-matched `Expense`, checkpoint fields cleared if it owned one — otherwise untouched
   *  apart from `updatedAt`. Stays a perfectly ordinary recorded transaction; nothing about it is
   *  deleted or flagged. */
  updatedExpense: Expense;
  /** The ORIGINAL batch this row came from, with a new `skippedRows` entry appended — the unmatched
   *  statement line reappears as an ordinary skipped-unresolved row (same "resolve" action available
   *  on it), never silently discarded. The batch's own historical counts (`matchedCount` etc.) are
   *  deliberately left as-is — they're a record of what that import session itself concluded, not a
   *  live-updating tally; the ledger's own live sweep is what reflects the current true state. */
  updatedBatch: ImportBatchSummary;
}

/**
 * "Unmatch" — the statement line and the `Expense` it was wrongly linked to are pulled apart. The
 * `Expense` stays exactly as recorded (just no longer claiming a statement link); the statement line's
 * own facts (`rawNarration`/`date`/`amount`) are never lost — they get appended back to the batch's own
 * `skippedRows`, converting this row into an ordinary unresolved one. Direction is derived from the
 * EXPENSE's own current sign (`delta()`), not guessed from `record.type` — a transfer record's `type`
 * alone can't tell debit from credit, but the linked expense's sign always can.
 */
export function unmatchLedgerRow(
  accountId: string,
  expense: Expense,
  record: BankStatementImportRecord,
  batch: ImportBatchSummary,
  now: number
): UnmatchResult {
  const direction: StatementLineDirection = delta(accountId, expense) >= 0 ? 'credit' : 'debit';
  const rowIndex = record.sourceRowIndex;
  // Idempotent — found + fixed 2026-08-11 (on-device testing), THEN corrected same day: repeatedly
  // matching then unmatching the SAME row appended a fresh `skippedRows` entry every single time,
  // producing 2, then 3, identical "skipped" rows in the ledger for what's really one statement line.
  // The first fix (value-based dedup: narration + date + amount) was itself wrong for a real case —
  // two GENUINELY SEPARATE transactions can legitimately share identical narration/date/amount (e.g.
  // two same-day, same-merchant purchases), and that fix would have silently treated the second one as
  // "already skipped" and dropped it. Precise fix: `rowIndex` (the statement file's own 1-based line
  // number, now persisted end-to-end) identifies the EXACT row being unmatched — re-unmatching the
  // same row is idempotent because its `rowIndex` never changes across resolve/relink cycles, while
  // two different rows that merely look alike always keep their own distinct `rowIndex` and are never
  // confused. Falls back to the original value-based check only when `rowIndex` is unknown (a record
  // written before this field existed) — same documented, accepted ambiguity as always for that case.
  const alreadySkipped =
    rowIndex !== undefined
      ? batch.skippedRows.some((r) => r.rowIndex === rowIndex)
      : batch.skippedRows.some(
          (r) =>
            r.rowIndex === undefined &&
            normalizeNarration(r.rawNarration) === normalizeNarration(record.rawNarration) &&
            toDateKey(r.date) === toDateKey(record.date) &&
            r.amount === record.amount
        );
  const updatedBatch: ImportBatchSummary = alreadySkipped
    ? batch
    : {
        ...batch,
        skippedRows: [
          ...batch.skippedRows,
          {
            rawNarration: record.rawNarration,
            date: record.date,
            amount: record.amount,
            direction,
            ...(rowIndex !== undefined ? { rowIndex } : {})
          }
        ]
      };
  const updatedExpense =
    expense.accountId === accountId ? removeCheckpointFields(expense, now) : { ...expense, updatedAt: now };
  return { updatedExpense, updatedBatch };
}

export interface RelinkResult {
  /** The formerly-matched `Expense`, checkpoint fields cleared if it owned one. */
  updatedOldExpense: Expense;
  /** The newly-chosen `Expense`, corrected to the statement's own date/amount (and, if the old
   *  expense owned a checkpoint, that checkpoint moved over) via the exact same
   *  `reconcileMatchedExpense()` a live import commit uses — never a hand-rolled correction. */
  updatedNewExpense: Expense;
}

/**
 * "This isn't the right match" — re-points a statement line at a DIFFERENT existing `Expense`. The old
 * expense is unlinked (checkpoint fields cleared, if it owned one); the new expense is corrected to
 * agree with the statement the same way a live match already would be. The caller still owns updating
 * `BankStatementImportRecord.linkedTxnId` — this function only computes the two `Expense` sides.
 */
export function relinkLedgerRow(
  accountId: string,
  oldExpense: Expense,
  newExpense: Expense,
  record: BankStatementImportRecord,
  now: number
): RelinkResult {
  const oldOwnedCheckpoint = oldExpense.accountId === accountId;
  const direction: StatementLineDirection = delta(accountId, oldExpense) >= 0 ? 'credit' : 'debit';
  const statementRow: ParsedStatementRow = {
    rawNarration: record.rawNarration,
    date: record.date,
    amount: record.amount,
    direction,
    rowIndex: 0, // unused by `reconcileMatchedExpense` — only meaningful for the rejected-rows report
    ...(oldOwnedCheckpoint && oldExpense.statementBalance !== undefined ? { balance: oldExpense.statementBalance } : {})
  };
  const hasBalanceColumn = statementRow.balance !== undefined;
  const corrected = reconcileMatchedExpense(newExpense, statementRow, hasBalanceColumn, now, accountId);
  const updatedNewExpense = corrected ?? { ...newExpense, updatedAt: now };
  const updatedOldExpense = oldOwnedCheckpoint
    ? removeCheckpointFields(oldExpense, now)
    : { ...oldExpense, updatedAt: now };
  return { updatedOldExpense, updatedNewExpense };
}

/**
 * Resolves a still-unresolved skipped row by linking it to an ALREADY-recorded `Expense` ("Pick the
 * matching transaction") — corrects that expense to agree with the statement, the same way a live
 * match would. Never attaches a checkpoint (`statementBalance`) — a skipped row's own running-balance
 * value was never captured in the first place (`docs/plans/bank-reconciliation-ledger.md`'s own note on
 * why), so there's nothing to attach. The caller builds the new `BankStatementImportRecord` itself via
 * {@link buildResolvedImportRecord} (needs a fresh id, which this pure module never generates).
 */
export function resolveSkippedRowToExisting(
  accountId: string,
  skipped: { rawNarration: string; date: number; amount: number; direction?: StatementLineDirection },
  chosenExpense: Expense,
  now: number
): Expense {
  const statementRow: ParsedStatementRow = {
    rawNarration: skipped.rawNarration,
    date: skipped.date,
    amount: skipped.amount,
    // A legacy skipped row (committed before `direction` existed) falls back to `'credit'` — same
    // neutral-positive convention `ledger.ts`'s own rendering already uses for the identical case.
    direction: skipped.direction ?? 'credit',
    rowIndex: 0
  };
  const corrected = reconcileMatchedExpense(chosenExpense, statementRow, false, now, accountId);
  return corrected ?? { ...chosenExpense, updatedAt: now };
}

/**
 * Builds the `BankStatementImportRecord` a resolved skipped row (or a freshly-added "new transaction")
 * needs — reuses the row's ORIGINAL `batchId` rather than inventing a synthetic "manual resolution"
 * marker, since the row genuinely belongs to that batch; it just took longer to resolve than the
 * original review session. Caller supplies `id` (fresh `crypto.randomUUID()`) — this module generates
 * no IDs of its own, matching every other pure function in `core/bank-import/`.
 */
export function buildResolvedImportRecord(params: {
  id: string;
  batchId: string;
  accountId: string;
  rawNarration: string;
  date: number;
  amount: number;
  type: Expense['type'];
  linkedTxnId: string;
  normalizedKey: string;
  now: number;
  /** The resolved skipped row's own `rowIndex` (2026-08-11), carried forward onto the new record so
   *  it stays uniquely identifiable if this same row is later unmatched again. `undefined` for a
   *  legacy skipped row that predates `rowIndex` tracking. */
  sourceRowIndex?: number;
}): BankStatementImportRecord {
  return {
    id: params.id,
    batchId: params.batchId,
    accountId: params.accountId,
    rawNarration: params.rawNarration,
    normalizedKey: params.normalizedKey,
    date: params.date,
    amount: params.amount,
    type: params.type ?? 'expense',
    linkedTxnId: params.linkedTxnId,
    createdAt: params.now,
    ...(params.sourceRowIndex !== undefined ? { sourceRowIndex: params.sourceRowIndex } : {})
  };
}
