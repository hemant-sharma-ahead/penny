import type { Expense } from '@/core/db/types';
import { isExactAmount } from './matcher';
import type { ParsedStatementRow } from './types';

/**
 * Attaches a checkpoint (`Expense.statementBalance`, docs/plans/bank-balance-sync.md §4/§5/§7) to a
 * brand-new transaction being created from a statement row, at bank-import commit time. Only when the
 * confirmed column mapping actually had a Balance column AND this particular row carried a value (a
 * statement can map a balance column yet still have occasional gaps in it) — never guessed, never
 * backfilled from a neighboring row. Returns the expense unchanged (same reference) when neither
 * holds, so a caller can use this unconditionally without an extra branch.
 *
 * `currentAccountId` enforces an invariant `checkpointDiagnostics.ts`'s `buildComparisons()` already
 * documents and assumes but this function never actually checked (found + fixed 2026-08-09, reviewing
 * this plan's own completed work): a checkpoint is only ever meaningful relative to the account it was
 * attached FOR, never `toAccountId`. A brand-new `type: 'transfer'` row created here during commit can
 * have its own `accountId` be either side of the transfer depending on the statement row's debit/credit
 * direction (see `useBankImport.ts`'s new-transfer construction) — so this only writes
 * `statementBalance` when `expense.accountId === currentAccountId`; when this account is only the
 * `toAccountId` side, the balance column belongs to the OTHER bank entirely and must not be attached
 * here at all (that side will get its own checkpoint, correctly, whenever ITS OWN bank is imported).
 *
 * Callers are expected to only invoke this for `Account.type === 'bank'` (docs/plans/
 * bank-balance-sync.md §3/§16, Finding 2 — credit cards are explicitly out of scope for the whole
 * checkpoint mechanism); this function itself has no account-type context, so that gate lives at the
 * call site (`useBankImport.ts`'s commit flow).
 */
export function attachCheckpoint(
  expense: Expense,
  statementRow: ParsedStatementRow,
  hasBalanceColumn: boolean,
  currentAccountId: string
): Expense {
  if (!hasBalanceColumn || statementRow.balance === undefined) return expense;
  if (expense.accountId !== currentAccountId) return expense;
  return { ...expense, statementBalance: statementRow.balance };
}

/**
 * Computes the corrected `Expense` for an already-existing transaction a statement row matched
 * against, at bank-import commit time (docs/plans/bank-balance-sync.md §5/§8):
 *
 * - **Date** is always corrected to the statement row's own date when it differs — the bank's date is
 *   ground truth; matching itself only ever required "close enough" (±3 days), so a matched pair's
 *   stored date could be stale by design until now.
 * - **Amount** is corrected to the statement row's own exact value when it differs, applied
 *   unconditionally rather than special-cased by which review bucket produced the pair. In practice
 *   this only ever actually changes anything for a user-resolved match — every automatically-produced
 *   pair (Tier 1's exact provenance hit, Tier 2's confident auto-match) already requires an exact
 *   amount by construction (see `matcher.ts`), so this is a no-op for those; a manually
 *   reassigned/resolved pair can point at any candidate, amount included, which is exactly the case
 *   plan §8 calls out.
 * - **Checkpoint** (`statementBalance`) is attached the same way `attachCheckpoint` does for new rows —
 *   including the same `currentAccountId` guard (see that function's own doc comment): only written
 *   when `expense.accountId === currentAccountId`, never when this account is only the transfer's
 *   `toAccountId` side. This enforces an invariant `checkpointDiagnostics.ts`'s `buildComparisons()`
 *   already documents and assumes but this function never actually checked (found + fixed 2026-08-09,
 *   reviewing this plan's own completed work) — a matched transfer whose `accountId` is Bank A can
 *   legitimately be matched AGAIN when Bank B (the `toAccountId` side) is later imported on its own
 *   (the candidate pool includes `e.toAccountId === accountId`); without this guard, that second import
 *   would silently overwrite Bank A's already-correct checkpoint with Bank B's own unrelated balance.
 *
 * Returns `undefined` when nothing actually changed, so the caller can skip a no-op write. No
 * confirmation dialog needed for any of this — confirming the match already was the user's decision
 * (plan §8); this just finishes applying it.
 */
export function reconcileMatchedExpense(
  expense: Expense,
  statementRow: ParsedStatementRow,
  hasBalanceColumn: boolean,
  now: number,
  currentAccountId: string
): Expense | undefined {
  let changed = false;
  const next: Expense = { ...expense };

  if (expense.date !== statementRow.date) {
    next.date = statementRow.date;
    changed = true;
  }
  if (!isExactAmount(expense.amount, statementRow.amount)) {
    next.amount = statementRow.amount;
    changed = true;
  }
  if (
    hasBalanceColumn &&
    statementRow.balance !== undefined &&
    expense.accountId === currentAccountId &&
    expense.statementBalance !== statementRow.balance
  ) {
    next.statementBalance = statementRow.balance;
    changed = true;
  }

  if (!changed) return undefined;
  next.updatedAt = now;
  return next;
}
