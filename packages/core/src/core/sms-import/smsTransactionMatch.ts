// Matches a parsed SMS candidate against already-recorded transactions (Tier 2) and against other
// parsed SMS (the "two SMS, one real event" case) — docs/plans/sms-transaction-tracking.md §4.
// Tier 1 (exact SMS-provenance dedup via `contentHash`) is the caller's own lookup against its own
// `SmsTransactionRecord` history, not this file's concern — see that plan section for the full
// two-tier shape this generalizes from `core/bank-import/matcher.ts`'s `matchStatementRows()`.
import type { Expense } from '@/core/db/types';
import { DAY_MS, toDateKey } from '@/lib/date';
import { descriptionSimilarity, isExactAmount, matchesDirection } from '@/core/bank-import/matcher';
import type { ParsedSmsCandidate } from './smsParser';

/** ±1 day — deliberately tighter than bank-import's ±3-day statement window (plan §4a): an SMS
 *  arrives the same day as the real transaction, unlike a monthly bank statement line. */
const SMS_CANDIDATE_WINDOW_MS = DAY_MS;

export type SmsExpenseMatchResult =
  | { kind: 'none' }
  | { kind: 'matched'; expenseId: string }
  | { kind: 'possible'; expenseIds: string[] }
  /** A single confident candidate exists, but it's already bank-reconciled
   *  (`Expense.statementBalance != null`) and its date disagrees with the SMS's own extracted date
   *  — plan §4a's explicit guard: never silently auto-link over a discrepancy against
   *  ground-truth reconciled data, even when amount/account/direction all agree. Surfaced as its own
   *  `SmsReviewReason` ('reconciled_date_conflict'), not folded into a plain 'possible'. */
  | { kind: 'reconciled_conflict'; expenseId: string };

function finalizeMatch(expense: Expense, candidate: ParsedSmsCandidate): SmsExpenseMatchResult {
  if (expense.statementBalance != null && toDateKey(expense.date) !== toDateKey(candidate.date)) {
    return { kind: 'reconciled_conflict', expenseId: expense.id };
  }
  return { kind: 'matched', expenseId: expense.id };
}

/** Tier 2 fuzzy match — same account, matching direction, exact amount, date within
 *  `SMS_CANDIDATE_WINDOW_MS`; a same-day shortlist is preferred over the full window when both
 *  exist, then `descriptionSimilarity` (candidate's own `counterparty` vs. the expense's
 *  description) tie-breaks a same-amount shortlist of more than one — identical shape to
 *  `matchStatementRows()`, just re-derived here rather than imported wholesale (the two callers'
 *  input shapes — `ParsedStatementRow` vs `ParsedSmsCandidate` — don't align closely enough to share
 *  the outer function itself, only the primitives: `isExactAmount`, `descriptionSimilarity`,
 *  `matchesDirection`, all reused directly). */
export function matchSmsAgainstExpenses(
  candidate: ParsedSmsCandidate,
  accountId: string,
  expenses: Expense[]
): SmsExpenseMatchResult {
  const pool = expenses.filter(
    (e) =>
      (e.accountId === accountId || e.toAccountId === accountId) &&
      Math.abs(e.date - candidate.date) <= SMS_CANDIDATE_WINDOW_MS &&
      isExactAmount(e.amount, candidate.amount) &&
      matchesDirection(e, candidate, accountId)
  );

  if (pool.length === 0) return { kind: 'none' };

  const sameDay = pool.filter((e) => toDateKey(e.date) === toDateKey(candidate.date));
  const shortlist = sameDay.length > 0 ? sameDay : pool;

  const [only] = shortlist;
  if (shortlist.length === 1 && only) return finalizeMatch(only, candidate);

  const scored = shortlist
    .map((e) => ({ e, score: descriptionSimilarity(candidate.counterparty ?? '', e.description) }))
    .sort((a, b) => b.score - a.score);
  const [top, runnerUp] = scored;
  if (top && top.score > 0 && top.score > (runnerUp?.score ?? -1)) return finalizeMatch(top.e, candidate);

  return { kind: 'possible', expenseIds: shortlist.map((e) => e.id) };
}

/** A minimal shape for "another already-parsed SMS candidate" — deliberately not the full
 *  `SmsTransactionRecord` (the caller already has that; this only needs the fields the duplicate
 *  check actually compares). */
export interface OtherSmsCandidate {
  id: string;
  accountId?: string;
  date: number;
  amount: number;
  direction: 'debit' | 'credit';
}

/** SMS-vs-SMS duplicate check (plan §4b) — e.g. a bank sending both a generic "debited" alert and a
 *  separate UPI-rail confirmation for one real payment, or a delivery retry. Same
 *  amount/direction/±1-day-window shape as the Tier-2 Expense match above, run against other parsed
 *  SMS instead. Per the user's explicit instruction, this NEVER auto-merges or auto-picks — any
 *  candidate found here is always surfaced as "Possible duplicate SMS" for the user to decide. */
export function findPossibleDuplicateSms(
  candidate: ParsedSmsCandidate,
  accountId: string,
  others: OtherSmsCandidate[]
): string[] {
  return others
    .filter(
      (o) =>
        o.accountId === accountId &&
        o.direction === candidate.direction &&
        isExactAmount(o.amount, candidate.amount) &&
        Math.abs(o.date - candidate.date) <= SMS_CANDIDATE_WINDOW_MS
    )
    .map((o) => o.id);
}
