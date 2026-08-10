import type { Expense } from '@/core/db/types';
import { delta } from '@/core/accounts/balanceCalculator';
import { toDateKey } from '@/lib/date';

/**
 * The checkpoint-diff diagnostic engine (docs/plans/bank-balance-sync.md §3 decision #4/#5, §7 Stage
 * 4) — walks an account's own transactions chronologically, comparing Penny's own derived running
 * balance against every `Expense.statementBalance` checkpoint (Stage 1) along the way. This is the
 * "provably correct, not just probably fine" mechanism the whole plan is built around: a single
 * end-of-period check (the now-removed `balanceCheck.ts`, pre-existing) can't distinguish a missing/duplicate
 * transaction from a wrong opening balance — a per-checkpoint history can, because a wrong opening
 * balance shows up as the exact same offset at EVERY checkpoint (including the very first one),
 * while a missing/duplicate transaction shows up once, partway through, and then holds steady
 * (simulation §7b/§7c/§7d — this file's own tests reproduce those exact numbers as regressions).
 */

export interface CheckpointComparison {
  /** The calendar day this checkpoint represents (§7e: same-day multiples are bucketed into ONE
   *  combined end-of-day checkpoint, not compared mid-day — see this file's own day-bucketing note
   *  below). This is the representative checkpointed transaction's own `date`, not a truncated
   *  midnight value. */
  date: number;
  /** The specific checkpointed `Expense.id` this comparison is anchored to — when a day has more than
   *  one checkpointed transaction, this is the last one in sorted order (see day-bucketing note). Used
   *  by the UI to highlight the exact row(s) a mismatch's search window points at. */
  expenseId: string;
  /** Penny's own derived running balance for this account, after every transaction up to and
   *  including this checkpoint's own calendar day. */
  computedBalance: number;
  /** The bank's own stated balance at this checkpoint — ground truth, copied verbatim from
   *  `Expense.statementBalance`. */
  statementBalance: number;
  /** `statementBalance - computedBalance` (NOT `computed - statement`) — matches the simulation's own
   *  sign convention (docs/plans/bank-balance-sync-simulation.html §7b/7c/7d): positive means the bank
   *  shows MORE than Penny does (a missing credit, a duplicate debit, or an opening balance set too
   *  low), negative means the reverse. */
  diff: number;
}

export type CheckpointSignature = 'flat-from-start' | 'steps-partway';

export interface CheckpointMismatch {
  signature: CheckpointSignature;
  /** The last checkpoint that agreed (within tolerance) before the gap — `undefined` for
   *  `'flat-from-start'`, since by definition no checkpoint ever agreed, not even the first one
   *  (simulation §7d's own "was there ever an agreeing checkpoint at all?" distinction). */
  lastAgreeing?: CheckpointComparison;
  /** The first checkpoint that disagreed — for `'steps-partway'`, the search window is exactly
   *  `(lastAgreeing, firstDisagreeing]`; for `'flat-from-start'`, this IS the first checkpoint that
   *  ever existed. */
  firstDisagreeing: CheckpointComparison;
  /** `firstDisagreeing.diff`, surfaced at the top level since it's what the UI's collapsed banner
   *  shows ("Balance mismatch between 25 Apr and 3 May, ₹120") without reaching into the pair. */
  diff: number;
  /** `'flat-from-start'` ONLY — `undefined` for `'steps-partway'`, where this question doesn't apply.
   *  `true` when every single comparison's diff matches `firstDisagreeing.diff` within tolerance (the
   *  simulation §7d definition of "flat": a constant, unchanging offset from the very first checkpoint
   *  onward). `false` when a LATER checkpoint disagrees by a DIFFERENT amount than the first one — the
   *  opening balance is still the right first thing to check (the first checkpoint was never right
   *  either), but the diff changing again later means there's evidently also a second, separate issue
   *  somewhere after that, which fixing the opening balance alone won't resolve. */
  diffStaysConstant?: boolean;
}

export interface CheckpointDiagnostics {
  /** Every checkpoint comparison, in chronological order — empty when the account has no checkpointed
   *  transactions at all (§7's "never imported" state, distinct from "verified"). */
  comparisons: CheckpointComparison[];
  /** True when there are no checkpoints yet, OR every checkpoint agrees within tolerance (docs/plans/
   *  bank-balance-sync.md §9 Q1's resolved decision: "no checkpoints yet" and "verified" are the SAME
   *  boolean here — callers that need to distinguish "never imported" from "verified" do so via
   *  `comparisons.length === 0`, exactly as the mockup's Frame 2b/2c split requires). */
  verified: boolean;
  mismatch?: CheckpointMismatch;
}

interface DayCheckpoint {
  expenseId: string;
  date: number;
  statementBalance: number;
}

/**
 * Builds the ordered checkpoint-comparison list for one account. `txns` should be every `Expense`
 * touching this account (as either `accountId` or `toAccountId`) — not pre-filtered to checkpointed
 * ones — since the running balance needs every transaction's own effect, checkpointed or not.
 *
 * **Day-bucketing (§7e), upgraded by Stage 5's intra-day sequencing (§9)**: a statement's balance
 * column is only meaningful in the bank's own row order — which Penny doesn't otherwise preserve
 * within a day UNLESS `Expense.reconciledSeq` (Stage 5) has been assigned. Two cases per calendar day:
 *
 * - **Every checkpointed transaction that day carries a `reconciledSeq`** (Stage 5 only ever assigns it
 *   as an all-or-nothing per-day operation, so this also means the whole day was resolved by one
 *   statement — see `reconciledSeq.ts`'s own doc comment) — the day's own sort order above is now
 *   trustworthy, so each checkpointed transaction gets its OWN comparison, in that true intra-day
 *   order, with `computedBalance` reflecting the running balance immediately after that specific
 *   transaction (and any earlier same-day ones), not the whole day. This is the actual payoff of Stage
 *   5: a genuine intra-day checkpoint per statement row, not just one per day.
 * - **Otherwise (the pre-Stage-5 default, still the common case)** — comparing mid-day would risk a
 *   false mismatch from nothing more than within-day ordering Penny never claimed to track, so the
 *   whole same-day cluster is walked as one combined checkpoint at day's end: the running balance used
 *   for comparison is always the balance AFTER every transaction dated that day. When a day has more
 *   than one checkpointed transaction, the LAST one in sorted order (by `reconciledSeq` if set on more
 *   than one of them, else stable array order) is the representative one shown/highlighted — a
 *   documented simplification, not a guess: without a fully-sequenced day, Penny has no way to know
 *   which same-day statement row was truly last.
 *
 * **Pre-anchor exclusion (found + fixed 2026-08-09, via on-device testing)**: `openingBalance` is only
 * ever a verified figure AS OF `openingBalanceAsOfDate` (`Account.openingBalanceAsOfDate`, Stage 3's
 * `openingBalanceAnchor.ts`) — before that field existed (or when it's still `undefined`, the common
 * case for an account that never went through a backfill/anchor-shift), the earliest transaction in the
 * whole ledger was always at-or-after the anchor by construction, so walking from `openingBalance`
 * starting at the very first transaction was always safe. That invariant breaks the moment a user
 * backfills an earlier period and explicitly declines to shift the anchor (§14b's "keep the original,
 * flag for later" outcome, persisted as `Account.anchorReference`) — now there are genuinely real
 * transactions dated strictly BEFORE the anchor, and applying `openingBalance` as if it covered them too
 * produces a fabricated mismatch that is pure artifact, not a real discrepancy (confirmed on-device:
 * ₹50,000 anchored 2-Apr wrongly applied to 5-Jan, producing a bogus ₹30,000+ "flat-from-start" flag on
 * an account that was already correctly verified). When `openingBalanceAsOfDate` is set, any transaction
 * dated strictly before it is excluded from this walk ENTIRELY — not just from being a checkpoint
 * source, but from contributing to the running-balance accumulation at all, since there is no verified
 * baseline for that earlier period once the user has declined to move the anchor to cover it. This is
 * deliberately narrower than `computeBalance()`/`balanceCalculator.ts`, which must keep including every
 * transaction regardless of date for the account's real total balance — this exclusion is scoped to only
 * this diagnostic comparison walk.
 */
function buildComparisons(
  accountId: string,
  openingBalance: number,
  txns: Expense[],
  openingBalanceAsOfDate: number | undefined
): CheckpointComparison[] {
  const relevant = txns
    .map((txn, order) => ({ txn, order }))
    .filter(({ txn }) => txn.accountId === accountId || txn.toAccountId === accountId)
    .filter(({ txn }) => openingBalanceAsOfDate === undefined || txn.date >= openingBalanceAsOfDate)
    .sort((a, b) => {
      if (a.txn.date !== b.txn.date) return a.txn.date - b.txn.date;
      const aSeq = a.txn.reconciledSeq;
      const bSeq = b.txn.reconciledSeq;
      if (aSeq !== undefined && bSeq !== undefined && aSeq !== bSeq) return aSeq - bSeq;
      if (aSeq !== undefined && bSeq === undefined) return -1;
      if (aSeq === undefined && bSeq !== undefined) return 1;
      return a.order - b.order;
    });

  const comparisons: CheckpointComparison[] = [];
  let runningBalance = openingBalance;
  let i = 0;
  while (i < relevant.length) {
    const first = relevant[i];
    if (first === undefined) break; // unreachable given the `i < relevant.length` guard above
    const dayKey = toDateKey(first.txn.date);

    // Slice out this day's own entries first (lookahead, no balance mutation yet) — needed to decide
    // up front whether the whole cluster is fully sequenced, before walking it for real below.
    let j = i;
    const dayEntries: typeof relevant = [];
    while (j < relevant.length) {
      const entry = relevant[j];
      if (entry === undefined || toDateKey(entry.txn.date) !== dayKey) break;
      dayEntries.push(entry);
      j++;
    }

    const checkpointedEntries = dayEntries.filter(
      ({ txn }) => txn.accountId === accountId && txn.statementBalance !== undefined
    );
    // Checked against EVERY entry that day, not just the checkpointed subset (found + fixed 2026-08-09,
    // reviewing this stage's own work) — `reconciledSeq.ts` assigns `reconciledSeq` to every transaction
    // resolved that day when the day is fully explained, not only the ones that happen to carry a
    // checkpoint (a resolved row can lack `statementBalance` itself — "occasional gaps" — while the day
    // as a whole is still fully explained). Checking only `checkpointedEntries` would miss exactly the
    // case that actually matters: a day sequenced by an earlier import, then a brand-new, never-imported
    // manual transaction lands on that same day later. That new entry has no `reconciledSeq`, so the sort
    // comparator above pushes it to the end of the day regardless of its true position — silently
    // corrupting every per-transaction comparison computed after where it really belongs, producing a
    // spurious mismatch rather than the safe end-of-day fallback this was supposed to degrade to.
    // Requiring the WHOLE day (not just its checkpointed slice) to be sequenced closes that gap: a day
    // that's still genuinely fully explained already satisfies this, since Stage 5 always assigns
    // `reconciledSeq` day-wide, never partially.
    const fullySequenced =
      checkpointedEntries.length > 0 && dayEntries.every(({ txn }) => txn.reconciledSeq !== undefined);

    let dayEndCheckpoint: DayCheckpoint | undefined;
    for (const { txn } of dayEntries) {
      runningBalance += delta(accountId, txn);
      // Checkpoints are only ever meaningful relative to the account they were attached FOR — Stage
      // 1's `attachCheckpoint`/`reconcileMatchedExpense` always set `statementBalance` on a row whose
      // own `accountId` is the account being imported, never keyed off `toAccountId` — so a transfer's
      // credit side (this account as `toAccountId`) is never itself checkpoint-bearing.
      if (txn.accountId === accountId && txn.statementBalance !== undefined) {
        if (fullySequenced) {
          comparisons.push({
            date: txn.date,
            expenseId: txn.id,
            computedBalance: runningBalance,
            statementBalance: txn.statementBalance,
            diff: txn.statementBalance - runningBalance
          });
        } else {
          dayEndCheckpoint = { expenseId: txn.id, date: txn.date, statementBalance: txn.statementBalance };
        }
      }
    }

    if (!fullySequenced && dayEndCheckpoint !== undefined) {
      comparisons.push({
        date: dayEndCheckpoint.date,
        expenseId: dayEndCheckpoint.expenseId,
        computedBalance: runningBalance,
        statementBalance: dayEndCheckpoint.statementBalance,
        diff: dayEndCheckpoint.statementBalance - runningBalance
      });
    }

    i = j;
  }

  return comparisons;
}

/**
 * Classifies a mismatch from an already-built comparison list (docs/plans/bank-balance-sync.md §3
 * decision #5) — the entire diagnostic value of the checkpoint model boils down to this one question:
 * was there ever an agreeing checkpoint before the first disagreeing one? Yes → `'steps-partway'`
 * (look between the two for one missing/duplicate transaction). No, not even the very first checkpoint
 * → `'flat-from-start'` (check the opening balance instead).
 */
function classifyMismatch(
  comparisons: CheckpointComparison[],
  toleranceRupees: number
): CheckpointMismatch | undefined {
  const firstDisagreeingIndex = comparisons.findIndex((c) => Math.abs(c.diff) > toleranceRupees);
  if (firstDisagreeingIndex === -1) return undefined;
  const firstDisagreeing = comparisons[firstDisagreeingIndex];
  if (firstDisagreeing === undefined) return undefined; // unreachable — `findIndex` only returns a valid index or -1

  if (firstDisagreeingIndex === 0) {
    // "Flat" (simulation §7d) means the diff never just holds at the first disagreement — it holds at
    // EVERY later checkpoint too. A later checkpoint disagreeing by a different amount is a compound
    // situation: the opening balance is still off (the first checkpoint proves that), but there's also
    // a separate, later issue a pure opening-balance fix won't resolve.
    const diffStaysConstant = comparisons.every((c) => Math.abs(c.diff - firstDisagreeing.diff) <= toleranceRupees);
    return { signature: 'flat-from-start', firstDisagreeing, diff: firstDisagreeing.diff, diffStaysConstant };
  }
  const lastAgreeing = comparisons[firstDisagreeingIndex - 1];
  if (lastAgreeing === undefined) return undefined; // unreachable given `firstDisagreeingIndex > 0` above
  return { signature: 'steps-partway', lastAgreeing, firstDisagreeing, diff: firstDisagreeing.diff };
}

/**
 * Computes the full checkpoint-diff diagnostic for one account (docs/plans/bank-balance-sync.md §7
 * Stage 4). Pure, no I/O — callers pass in every `Expense` touching this account (see
 * {@link buildComparisons}'s own doc comment for why it must not be pre-filtered to checkpointed rows
 * only) and the account's own `openingBalance` (the CURRENT value — this does not itself resolve
 * `Account.openingBalanceAsOfDate`/anchor-shift history, which `openingBalanceAnchor.ts` already owns;
 * this function trusts whatever `openingBalance` it's given as the base to project forward from).
 *
 * @param openingBalanceAsOfDate `Account.openingBalanceAsOfDate` (Stage 3) — when set, any transaction
 * dated strictly before it is excluded from the comparison walk entirely (see {@link buildComparisons}'s
 * doc comment). `undefined` (the common case) preserves today's unchanged behavior: every transaction
 * included, exactly as before this parameter existed.
 * @param toleranceRupees matches the now-removed `balanceCheck.ts`'s own ±₹1 convention.
 */
export function computeCheckpointDiagnostics(
  accountId: string,
  openingBalance: number,
  txns: Expense[],
  openingBalanceAsOfDate?: number,
  toleranceRupees = 1
): CheckpointDiagnostics {
  const comparisons = buildComparisons(accountId, openingBalance, txns, openingBalanceAsOfDate);
  const mismatch = classifyMismatch(comparisons, toleranceRupees);
  // Built with a conditional spread, not a bare `mismatch` property, because `exactOptionalPropertyTypes`
  // (this package's tsconfig) treats an optional field as "absent or the real type", never "explicitly
  // set to `undefined`" — matches `openingBalanceAnchor.ts`/`coverage.ts`'s own existing convention for
  // optional return fields.
  return { comparisons, verified: !mismatch, ...(mismatch ? { mismatch } : {}) };
}
