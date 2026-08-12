import { describe, expect, it } from 'vitest';
import { computeCheckpointDiagnostics } from '@/core/bank-import/checkpointDiagnostics';
import type { Expense } from '@/core/db/types';

// Exact ledger from docs/plans/bank-balance-sync-simulation.html §7a — the shared 2-month HDFC
// Savings example every one of §7a/7b/7c/7d's variants is built from. True opening balance ₹50,000.
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day).getTime();
const ACCOUNT = 'acc-1';
const OPENING = 50_000;

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e',
    amount: 0,
    categoryId: 'cat',
    description: '',
    date: d(2026, 4, 1),
    hashtags: [],
    isRecurring: false,
    type: 'expense',
    accountId: ACCOUNT,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  };
}

/** §7a's happy-path ledger, every row checkpointed, every checkpoint agreeing. */
function happyPathLedger(): Expense[] {
  return [
    expense({ id: 'salary-1', type: 'income', amount: 80_000, date: d(2026, 4, 2), statementBalance: 130_000 }),
    expense({ id: 'atm-1', type: 'expense', amount: 5_000, date: d(2026, 4, 5), statementBalance: 125_000 }),
    expense({ id: 'swiggy', type: 'expense', amount: 850, date: d(2026, 4, 10), statementBalance: 124_150 }),
    expense({ id: 'rent', type: 'expense', amount: 15_000, date: d(2026, 4, 15), statementBalance: 109_150 }),
    expense({ id: 'sms', type: 'expense', amount: 150, date: d(2026, 4, 20), statementBalance: 109_000 }),
    expense({ id: 'groceries-1', type: 'expense', amount: 2_200, date: d(2026, 4, 25), statementBalance: 106_800 }),
    expense({ id: 'interest', type: 'income', amount: 120, date: d(2026, 4, 30), statementBalance: 106_920 }),
    expense({ id: 'salary-2', type: 'income', amount: 80_000, date: d(2026, 5, 3), statementBalance: 186_920 }),
    expense({ id: 'atm-2', type: 'expense', amount: 3_000, date: d(2026, 5, 8), statementBalance: 183_920 }),
    expense({ id: 'electricity', type: 'expense', amount: 1_800, date: d(2026, 5, 12), statementBalance: 182_120 }),
    expense({ id: 'groceries-2', type: 'expense', amount: 2_500, date: d(2026, 5, 18), statementBalance: 179_620 }),
    expense({ id: 'refund', type: 'income', amount: 300, date: d(2026, 5, 22), statementBalance: 179_920 }),
    expense({ id: 'amc', type: 'expense', amount: 590, date: d(2026, 5, 28), statementBalance: 179_330 })
  ];
}

describe('computeCheckpointDiagnostics — §7a happy path', () => {
  it('every checkpoint agrees — verified, no mismatch', () => {
    const result = computeCheckpointDiagnostics(ACCOUNT, OPENING, happyPathLedger());
    expect(result.comparisons).toHaveLength(13);
    expect(result.comparisons.every((c) => c.diff === 0)).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.mismatch).toBeUndefined();
  });
});

describe('computeCheckpointDiagnostics — §7b missing transaction (steps-partway)', () => {
  it('flags the exact last-agreeing/first-disagreeing pair and holds +₹120 steady after', () => {
    // The 30-Apr interest credit was never recorded in Penny at all — not just uncheckpointed, absent.
    const ledger = happyPathLedger().filter((e) => e.id !== 'interest');
    const result = computeCheckpointDiagnostics(ACCOUNT, OPENING, ledger);

    expect(result.verified).toBe(false);
    expect(result.mismatch).toBeDefined();
    const mismatch = result.mismatch;
    if (!mismatch) throw new Error('expected a mismatch');

    expect(mismatch.signature).toBe('steps-partway');
    expect(mismatch.lastAgreeing?.expenseId).toBe('groceries-1');
    expect(mismatch.lastAgreeing?.date).toBe(d(2026, 4, 25));
    expect(mismatch.lastAgreeing?.diff).toBe(0);
    expect(mismatch.firstDisagreeing.expenseId).toBe('salary-2');
    expect(mismatch.firstDisagreeing.date).toBe(d(2026, 5, 3));
    expect(mismatch.firstDisagreeing.diff).toBe(120);
    expect(mismatch.diff).toBe(120);

    // Every checkpoint after the first disagreement holds steady at +120, exactly per the simulation.
    const after = result.comparisons.filter((c) => c.date >= d(2026, 5, 3));
    expect(after.every((c) => c.diff === 120)).toBe(true);
  });
});

describe('computeCheckpointDiagnostics — §7c duplicate transaction (steps-partway)', () => {
  it('flags the same pair-shape, opposite root cause — a late duplicate debit', () => {
    const ledger = happyPathLedger();
    // Cashew's own late duplicate entry, 26-Apr, no statement row to attach to (no statementBalance).
    ledger.push(expense({ id: 'duplicate', type: 'expense', amount: 150, date: d(2026, 4, 26) }));
    const result = computeCheckpointDiagnostics(ACCOUNT, OPENING, ledger);

    expect(result.verified).toBe(false);
    const mismatch = result.mismatch;
    if (!mismatch) throw new Error('expected a mismatch');

    expect(mismatch.signature).toBe('steps-partway');
    expect(mismatch.lastAgreeing?.expenseId).toBe('groceries-1');
    expect(mismatch.lastAgreeing?.diff).toBe(0);
    expect(mismatch.firstDisagreeing.expenseId).toBe('interest');
    expect(mismatch.firstDisagreeing.date).toBe(d(2026, 4, 30));
    expect(mismatch.firstDisagreeing.diff).toBe(150);
    expect(mismatch.diff).toBe(150);

    // Holds steady at +150 for the rest of the ledger.
    const after = result.comparisons.filter((c) => c.date >= d(2026, 4, 30));
    expect(after.every((c) => c.diff === 150)).toBe(true);
  });
});

describe('computeCheckpointDiagnostics — §7d wrong opening balance (flat-from-start)', () => {
  it('flags the very first checkpoint as already off, no lastAgreeing, steady +₹1,000 forever, diffStaysConstant true', () => {
    // Same happy-path ledger, but the account's own opening balance was typed ₹1,000 too low.
    const result = computeCheckpointDiagnostics(ACCOUNT, OPENING - 1_000, happyPathLedger());

    expect(result.verified).toBe(false);
    const mismatch = result.mismatch;
    if (!mismatch) throw new Error('expected a mismatch');

    expect(mismatch.signature).toBe('flat-from-start');
    expect(mismatch.lastAgreeing).toBeUndefined();
    expect(mismatch.firstDisagreeing.expenseId).toBe('salary-1');
    expect(mismatch.firstDisagreeing.date).toBe(d(2026, 4, 2));
    expect(mismatch.firstDisagreeing.diff).toBe(1_000);
    expect(mismatch.diff).toBe(1_000);

    // Every single checkpoint, no exceptions — this IS what "flat" means, per §7d's own definition.
    expect(result.comparisons.every((c) => c.diff === 1_000)).toBe(true);
    expect(mismatch.diffStaysConstant).toBe(true);
  });

  // Synthetic, clearly-labeled case — NOT from the simulation (§7d has no compound-mismatch example of
  // its own). Minimal, invented numbers: same happy-path ledger and the same ₹1,000-too-low opening
  // balance as above (so the first checkpoint disagrees by +1,000, same as §7d), but every checkpoint
  // from the 8-May ATM withdrawal onward has its own bank-stated balance bumped by an EXTRA +500 on top
  // of that (simulating, e.g., a second, independent missing transaction posting on 8-May, whose effect
  // then persists through every later checkpoint the same way a real one would) — so the diff is +1,000
  // from 2-Apr through 3-May, then steps to a NEW steady +1,500 from 8-May onward. The opening balance
  // is still off (flat-from-start still correctly fires, since the very first checkpoint never agreed),
  // but the diff no longer holds constant everywhere, which is exactly the compound situation
  // `diffStaysConstant: false` exists to flag honestly.
  it('SYNTHETIC (not from the simulation): a later checkpoint disagreeing by a DIFFERENT amount ⇒ diffStaysConstant false', () => {
    const bumpFrom = d(2026, 5, 8);
    const ledger = happyPathLedger().map((e) =>
      e.statementBalance !== undefined && e.date >= bumpFrom ? { ...e, statementBalance: e.statementBalance + 500 } : e
    );
    const result = computeCheckpointDiagnostics(ACCOUNT, OPENING - 1_000, ledger);

    expect(result.verified).toBe(false);
    const mismatch = result.mismatch;
    if (!mismatch) throw new Error('expected a mismatch');

    expect(mismatch.signature).toBe('flat-from-start');
    expect(mismatch.firstDisagreeing.expenseId).toBe('salary-1');
    expect(mismatch.firstDisagreeing.diff).toBe(1_000);
    expect(mismatch.diffStaysConstant).toBe(false);

    // Confirms the shape actually invented: constant at +1,000 up through 3-May, then +1,500 from 8-May on.
    const beforeBump = result.comparisons.filter((c) => c.date < d(2026, 5, 8));
    const fromBump = result.comparisons.filter((c) => c.date >= d(2026, 5, 8));
    expect(beforeBump.every((c) => c.diff === 1_000)).toBe(true);
    expect(fromBump.every((c) => c.diff === 1_500)).toBe(true);
  });
});

describe('computeCheckpointDiagnostics — edge cases', () => {
  it('no checkpoints at all ⇒ verified (never-imported state, distinguished by empty comparisons)', () => {
    const ledger = happyPathLedger().map((e) => ({ ...e, statementBalance: undefined }) as Expense);
    const result = computeCheckpointDiagnostics(ACCOUNT, OPENING, ledger);
    expect(result.comparisons).toHaveLength(0);
    expect(result.verified).toBe(true);
    expect(result.mismatch).toBeUndefined();
  });

  it('ignores a checkpoint on a transaction unrelated to this account', () => {
    const ledger = [
      expense({ id: 'other', accountId: 'acc-2', amount: 100, date: d(2026, 4, 1), statementBalance: 999_999 })
    ];
    const result = computeCheckpointDiagnostics(ACCOUNT, OPENING, ledger);
    expect(result.comparisons).toHaveLength(0);
    expect(result.verified).toBe(true);
  });

  it('a transfer credit (toAccountId match) never itself becomes a checkpoint for that side', () => {
    const ledger = [
      expense({
        id: 'transfer-1',
        type: 'transfer',
        amount: 1_000,
        date: d(2026, 4, 1),
        accountId: 'acc-2',
        toAccountId: ACCOUNT,
        statementBalance: 55_000 // attached for acc-2's own import, not this account's
      })
    ];
    const result = computeCheckpointDiagnostics(ACCOUNT, OPENING, ledger);
    expect(result.comparisons).toHaveLength(0);
    expect(result.verified).toBe(true);
  });

  it('tolerance: a sub-₹1 diff is still verified', () => {
    const ledger = [expense({ id: 'e1', amount: 100, date: d(2026, 4, 1), statementBalance: OPENING - 100.5 })];
    const result = computeCheckpointDiagnostics(ACCOUNT, OPENING, ledger);
    expect(result.verified).toBe(true);
  });
});

// Stage 5 — intra-day sequencing (docs/plans/bank-balance-sync.md §3 decision #6, §7 Stage 5) upgrades
// `buildComparisons` to emit one comparison PER checkpointed transaction on a fully-sequenced day,
// instead of collapsing the whole day to one end-of-day comparison. Numbers below are the simulation's
// own §9 worked example: balance carried into 8-May ₹4,200, a 09:14 ATM withdrawal (−₹3,000 → ₹1,200)
// then an 18:40 UPI refund (+₹2,000 → ₹3,200) — same day, same end-of-day balance either way, but a
// very different story about what happened during the day.
describe('computeCheckpointDiagnostics — Stage 5 intra-day sequencing (§9 worked example)', () => {
  const DAY = d(2026, 5, 8);
  const CARRIED_IN = 4_200;

  it('a fully-sequenced day (2+ checkpointed txns, all with reconciledSeq) produces one comparison PER transaction, in sequence order', () => {
    const ledger = [
      expense({ id: 'atm', amount: 3_000, date: DAY, statementBalance: 1_200, reconciledSeq: 1 }),
      expense({ id: 'refund', type: 'income', amount: 2_000, date: DAY, statementBalance: 3_200, reconciledSeq: 2 })
    ];
    const result = computeCheckpointDiagnostics(ACCOUNT, CARRIED_IN, ledger);

    expect(result.comparisons).toHaveLength(2);
    expect(result.comparisons[0]).toMatchObject({
      expenseId: 'atm',
      computedBalance: 1_200,
      statementBalance: 1_200,
      diff: 0
    });
    expect(result.comparisons[1]).toMatchObject({
      expenseId: 'refund',
      computedBalance: 3_200,
      statementBalance: 3_200,
      diff: 0
    });
    expect(result.verified).toBe(true);
  });

  it('a fully-sequenced day catches a genuine mid-day mismatch that end-of-day bucketing would hide entirely', () => {
    // The bank's own stated balance after the ATM withdrawal is ₹100 off (₹1,300, not ₹1,200) — but the
    // day's end-of-day balance still nets out to the correct ₹3,200. An end-of-day-only check would see
    // no problem at all; per-checkpoint sequencing catches it exactly where it happened.
    const ledger = [
      expense({ id: 'atm', amount: 3_000, date: DAY, statementBalance: 1_300, reconciledSeq: 1 }),
      expense({ id: 'refund', type: 'income', amount: 2_000, date: DAY, statementBalance: 3_200, reconciledSeq: 2 })
    ];
    const result = computeCheckpointDiagnostics(ACCOUNT, CARRIED_IN, ledger);

    expect(result.comparisons).toHaveLength(2);
    expect(result.comparisons[0]).toMatchObject({
      expenseId: 'atm',
      computedBalance: 1_200,
      statementBalance: 1_300,
      diff: 100
    });
    expect(result.comparisons[1]).toMatchObject({
      expenseId: 'refund',
      computedBalance: 3_200,
      statementBalance: 3_200,
      diff: 0
    });
    expect(result.verified).toBe(false);
  });

  it('regression: a day that is NOT fully sequenced (no reconciledSeq set) still collapses to one end-of-day comparison, exactly as before Stage 5', () => {
    const ledger = [
      expense({ id: 'atm', amount: 3_000, date: DAY, statementBalance: 1_200 }),
      expense({ id: 'refund', type: 'income', amount: 2_000, date: DAY, statementBalance: 3_200 })
    ];
    const result = computeCheckpointDiagnostics(ACCOUNT, CARRIED_IN, ledger);

    expect(result.comparisons).toHaveLength(1);
    expect(result.comparisons[0]).toMatchObject({
      expenseId: 'refund', // last in stable array order — the pre-Stage-5 representative-row rule
      computedBalance: 3_200,
      statementBalance: 3_200,
      diff: 0
    });
    expect(result.verified).toBe(true);
  });

  it('regression: a day with only ONE reconciledSeq set among 2+ checkpointed txns still falls back to end-of-day (not "fully" sequenced)', () => {
    const ledger = [
      expense({ id: 'atm', amount: 3_000, date: DAY, statementBalance: 1_200, reconciledSeq: 1 }),
      expense({ id: 'refund', type: 'income', amount: 2_000, date: DAY, statementBalance: 3_200 }) // no reconciledSeq
    ];
    const result = computeCheckpointDiagnostics(ACCOUNT, CARRIED_IN, ledger);

    expect(result.comparisons).toHaveLength(1);
    expect(result.comparisons[0].expenseId).toBe('refund');
    expect(result.comparisons[0].computedBalance).toBe(3_200);
  });

  it('SYNTHETIC — found + fixed 2026-08-09 reviewing this stage: a day sequenced by one import, then a later, never-imported transaction lands on that same day, must NOT be treated as still fully sequenced', () => {
    // True chronological order that day: preexisting (unrelated, never checkpointed, no reconciledSeq)
    // → atm (checkpointed, seq 1) → refund (checkpointed, seq 2). Before the fix, `fullySequenced` only
    // checked the CHECKPOINTED entries for `reconciledSeq` — both atm/refund still had theirs, so the
    // day was (wrongly) treated as fully sequenced. The sort comparator pushes `preexisting` (no
    // reconciledSeq) to the END regardless of its true position, so both per-transaction comparisons got
    // computed WITHOUT `preexisting`'s −₹200 yet applied — both off by the exact same −₹200, which
    // `classifyMismatch` would misread as `'flat-from-start'`/`diffStaysConstant: true` (a confident
    // "go check your opening balance!" diagnosis) even though nothing is actually wrong except same-day
    // ordering Penny never had a right to assume. The fix requires the WHOLE day (including
    // `preexisting`) to be sequenced — since it never was, this correctly falls back to one safe
    // end-of-day comparison with no false mismatch at all.
    const opening = 1_000;
    const ledger = [
      expense({ id: 'preexisting', amount: 200, date: DAY }), // no statementBalance, no reconciledSeq
      expense({ id: 'atm', amount: 300, date: DAY, statementBalance: 500, reconciledSeq: 1 }),
      expense({ id: 'refund', type: 'income', amount: 150, date: DAY, statementBalance: 650, reconciledSeq: 2 })
    ];
    const result = computeCheckpointDiagnostics(ACCOUNT, opening, ledger);

    // Correct (post-fix) behavior: one end-of-day comparison, everything reconciles, no false alarm.
    expect(result.comparisons).toHaveLength(1);
    expect(result.comparisons[0]).toMatchObject({
      expenseId: 'refund',
      computedBalance: 650,
      statementBalance: 650,
      diff: 0
    });
    expect(result.verified).toBe(true);
  });
});

// `openingBalanceAsOfDate` pre-anchor exclusion — found + fixed 2026-08-09, via on-device testing.
// Reproduces the exact confirmed scenario: an account anchored at ₹50,000 as of 2-Apr-2026 (already
// correctly verified against a real statement), then a backfill for an earlier period was imported and
// the user chose "keep the original ₹50,000, flag for later" (§14b) rather than shifting the anchor. The
// backfilled transactions are real and correctly checkpointed against their OWN contemporaneous
// balances — they just aren't covered by the ₹50,000 anchor, which only ever claimed to describe the
// balance as of 2-Apr onward. Before this fix, `buildComparisons` had no concept of the anchor date at
// all and walked every transaction from the very first one using `openingBalance` as the running
// balance's starting point — applying a balance figure 3 months before it ever applied, and fabricating
// a mismatch out of nothing.
describe('computeCheckpointDiagnostics — openingBalanceAsOfDate pre-anchor exclusion (real bug, 2026-08-09)', () => {
  const ANCHOR_DATE = d(2026, 4, 2);
  const ANCHOR_BALANCE = 50_000;

  // Real, internally-consistent checkpointed history from BEFORE the anchor — entirely unrelated to the
  // ₹50,000 anchor figure, which never claimed to cover this period at all.
  const preAnchorLedger = (): Expense[] => [
    expense({ id: 'pre-1', type: 'income', amount: 10_000, date: d(2026, 1, 5), statementBalance: 40_000 }),
    expense({ id: 'pre-2', type: 'expense', amount: 2_000, date: d(2026, 3, 20), statementBalance: 38_000 })
  ];

  // Real, correctly-verified checkpointed history from the anchor date onward — this is the part that
  // was ALREADY confirmed correct against a real statement before the backfill ever happened.
  const postAnchorLedger = (): Expense[] => [
    expense({ id: 'post-1', type: 'expense', amount: 3_000, date: d(2026, 4, 10), statementBalance: 47_000 }),
    expense({ id: 'post-2', type: 'income', amount: 5_000, date: d(2026, 4, 15), statementBalance: 52_000 })
  ];

  it('excludes pre-anchor transactions entirely and reports verified: true, matching the real, already-verified post-anchor history', () => {
    const ledger = [...preAnchorLedger(), ...postAnchorLedger()];
    const result = computeCheckpointDiagnostics(ACCOUNT, ANCHOR_BALANCE, ledger, ANCHOR_DATE);

    // Only the two post-anchor checkpoints are ever compared — the pre-anchor ones never entered the walk.
    expect(result.comparisons).toHaveLength(2);
    expect(result.comparisons.map((c) => c.expenseId)).toEqual(['post-1', 'post-2']);
    expect(result.comparisons.every((c) => c.diff === 0)).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.mismatch).toBeUndefined();
  });

  it('a transaction dated EXACTLY on the anchor date is included (inclusive lower bound, per openingBalanceAnchor.ts convention)', () => {
    const ledger = [
      expense({ id: 'on-anchor', type: 'expense', amount: 1_000, date: ANCHOR_DATE, statementBalance: 49_000 })
    ];
    const result = computeCheckpointDiagnostics(ACCOUNT, ANCHOR_BALANCE, ledger, ANCHOR_DATE);
    expect(result.comparisons).toHaveLength(1);
    expect(result.comparisons[0]).toMatchObject({ expenseId: 'on-anchor', computedBalance: 49_000, diff: 0 });
    expect(result.verified).toBe(true);
  });

  it('undefined openingBalanceAsOfDate (the common, never-backfilled case) is completely unchanged: pre-anchor-shaped transactions are still included and produce the old fabricated mismatch', () => {
    // Same ledger as the main case above, but WITHOUT passing an anchor date at all — confirms this fix
    // is purely additive and never regresses an account that hasn't gone through Stage 3's anchor-shift
    // flow. `openingBalance` here plays the role of "the account's one true opening balance from the
    // very start", so walking every transaction from it (the old, only behavior) is correct in this case.
    const ledger = [...preAnchorLedger(), ...postAnchorLedger()];
    const result = computeCheckpointDiagnostics(ACCOUNT, ANCHOR_BALANCE, ledger);
    expect(result.comparisons).toHaveLength(4);
    expect(result.verified).toBe(false);
    expect(result.mismatch?.signature).toBe('flat-from-start');
  });

  // Confirms the OLD (pre-fix) behavior really would have failed the main regression test above — this
  // was actually verified (not just asserted) by temporarily reverting `buildComparisons`'s pre-anchor
  // `.filter(...)` line and re-running this exact test: without the exclusion, `pre-1`/`pre-2` enter the
  // walk starting from the ₹50,000 anchor (3 months before it applies), producing `comparisons` of length
  // 4 (not 2) and failing the `toHaveLength(2)` assertion above — i.e. exactly the on-device bug, not a
  // hypothetical. Left as this comment rather than a live parameterized test (same pattern as the Stage 5
  // day-bucketing fix elsewhere in this file) since re-running it every CI pass would require duplicating
  // the pre-fix code path, not just documenting that it was checked.
  it('sanity: the post-anchor ledger alone (no pre-anchor rows) is verified even under the OLD behavior — isolates that the bug is specifically about pre-anchor rows, not the post-anchor math', () => {
    const result = computeCheckpointDiagnostics(ACCOUNT, ANCHOR_BALANCE, postAnchorLedger(), ANCHOR_DATE);
    expect(result.verified).toBe(true);
  });
});
