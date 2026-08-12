import type { Expense } from '@/core/db/types';
import type { ParsedStatementRow } from './types';
import { toDateKey } from '@/lib/date';

/**
 * Stage 5 — intra-day sequencing (docs/plans/bank-balance-sync.md §3 decision #6, §7 Stage 5, §9 of
 * the simulation). `Expense.reconciledSeq` gives `checkpointDiagnostics.ts` a real, checkpoint-
 * verifiable intra-day order instead of its pre-Stage-5 end-of-day-only fallback — but ONLY on a day
 * where every single one of this account's own transactions is explained by one statement's own rows
 * (matched to an existing expense, or newly created from it). A day with even one leftover, unrelated
 * transaction has no reliable ground truth for where that transaction actually falls relative to the
 * statement's own rows, so it falls back to end-of-day (§9's own rule, unchanged).
 *
 * This module is deliberately pure and I/O-free — it never reads `expensesRepo` itself. Callers (the
 * bank-import commit flow, `useBankImport.ts`) gather the day's own resolved rows and the account's
 * other, untouched transactions for that day, and pass them in.
 */

/** One statement row this import resolved (matched to an existing expense, or used to create a new
 *  one) for a single calendar day, on the account being imported. `expenseId` is the resolved expense's
 *  own id — already known before commit for both cases (an existing id for a match, a pre-generated one
 *  for a staged new transaction — mirrors `attachCheckpoint`'s own "caller assigns ids before commit"
 *  convention). */
export interface DayResolution {
  statementRow: ParsedStatementRow;
  expenseId: string;
}

export interface DaySequenceResult {
  /** `true` only when this day's `resolvedThisDay` is non-empty AND there was no leftover, unrelated
   *  transaction on the same account/day (`otherUnexplainedCount === 0`) — mirrors
   *  `Expense.reconciledSeq`'s own doc comment: "explained by ONE statement's own rows." */
  fullyExplained: boolean;
  /** `expenseId -> reconciledSeq` (1-based), in the statement's own row order for the day
   *  (`ParsedStatementRow.rowIndex` ascending, never `Expense.date`'s time-of-day or insertion order —
   *  see this stage's plan write-up for why). Empty when `fullyExplained` is `false`. */
  sequenceByExpenseId: Map<string, number>;
}

/**
 * Determines whether one calendar day is "fully explained" by this import, and if so, assigns each
 * resolved transaction its `reconciledSeq` straight from the statement's own row order for that day.
 *
 * @param resolvedThisDay every statement row this import resolved (matched or newly created) for ONE
 *   calendar day, on the account being imported.
 * @param otherUnexplainedCount how many OTHER `Expense`s exist on this same account/day that this
 *   import did NOT resolve (an existing, untouched transaction, still present after this same commit's
 *   own deletions) — non-zero means the day isn't fully explained, so nothing is assigned.
 */
export function computeDaySequence(resolvedThisDay: DayResolution[], otherUnexplainedCount: number): DaySequenceResult {
  if (resolvedThisDay.length === 0 || otherUnexplainedCount > 0) {
    return { fullyExplained: false, sequenceByExpenseId: new Map() };
  }
  const sequenceByExpenseId = new Map<string, number>();
  [...resolvedThisDay]
    .sort((a, b) => a.statementRow.rowIndex - b.statementRow.rowIndex)
    .forEach((entry, index) => sequenceByExpenseId.set(entry.expenseId, index + 1));
  return { fullyExplained: true, sequenceByExpenseId };
}

/** Groups a whole import's worth of day-resolutions by calendar day (`toDateKey` of each row's own
 *  `date`, i.e. the statement's ground truth — never the resolved expense's possibly-stale
 *  pre-correction date), for a caller that wants one {@link computeDaySequence} call per day. */
export function groupResolutionsByDay(resolutions: DayResolution[]): Map<string, DayResolution[]> {
  const byDay = new Map<string, DayResolution[]>();
  for (const r of resolutions) {
    const key = toDateKey(r.statementRow.date);
    const existing = byDay.get(key);
    if (existing) existing.push(r);
    else byDay.set(key, [r]);
  }
  return byDay;
}

/**
 * Counts, per calendar day (`toDateKey`), how many of `otherExpenses` are "leftover" for `accountId` —
 * an existing Penny transaction on this account/day that this import neither resolved
 * (`resolvedExpenseIds`) nor is deleting as part of this same commit (`deletedExpenseIds`, e.g. a
 * lone-wolf duplicate). Feed the result straight into {@link computeDaySequence}'s own
 * `otherUnexplainedCount` parameter, keyed by the same day.
 */
export function countOtherUnexplainedByDay(
  accountId: string,
  otherExpenses: Pick<Expense, 'id' | 'accountId' | 'date'>[],
  resolvedExpenseIds: ReadonlySet<string>,
  deletedExpenseIds: ReadonlySet<string> = new Set()
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of otherExpenses) {
    if (e.accountId !== accountId) continue;
    if (resolvedExpenseIds.has(e.id) || deletedExpenseIds.has(e.id)) continue;
    const key = toDateKey(e.date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
