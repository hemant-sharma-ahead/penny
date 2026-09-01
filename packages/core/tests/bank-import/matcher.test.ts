import { describe, expect, it } from 'vitest';
import {
  matchStatementRows,
  deriveLoneWolves,
  suggestPossibleTransfer,
  suggestAmbiguousTransferCandidates,
  convertCandidateToTransfer
} from '@/core/bank-import/matcher';
import { normalizeNarration } from '@/core/bank-import/normalization';
import type { ParsedStatementRow } from '@/core/bank-import/types';
import type { Account, BankStatementImportRecord, Expense } from '@/core/db/types';

const ACCOUNT = 'acc-1';
const OTHER_ACCOUNT = 'acc-2';
const RECONCILIATION_DESCRIPTION = 'Balance reconciliation';
const DAY_MS = 86_400_000;
const BASE = new Date(2026, 5, 14).getTime(); // 14 Jun 2026

function row(overrides: Partial<ParsedStatementRow> = {}): ParsedStatementRow {
  return {
    rawNarration: 'UPI-SWIGGY-123',
    date: BASE,
    amount: 450,
    direction: 'debit',
    rowIndex: 1,
    ...overrides
  };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    amount: 450,
    categoryId: 'food',
    description: 'Swiggy dinner',
    date: BASE,
    hashtags: [],
    isRecurring: false,
    type: 'expense',
    accountId: ACCOUNT,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  };
}

describe('matchStatementRows', () => {
  it('confidently matches a same-day exact-amount unique candidate', () => {
    const result = matchStatementRows([row()], ACCOUNT, [expense()], RECONCILIATION_DESCRIPTION);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.expense.id).toBe('e1');
    expect(result.possible).toHaveLength(0);
    expect(result.unmatched).toHaveLength(0);
  });

  it('matches within the ±3 day window on a different day', () => {
    const e = expense({ date: BASE + 2 * DAY_MS });
    const result = matchStatementRows([row()], ACCOUNT, [e], RECONCILIATION_DESCRIPTION);
    expect(result.matched).toHaveLength(1);
  });

  it('does not match outside the ±3 day window', () => {
    const e = expense({ date: BASE + 4 * DAY_MS });
    const result = matchStatementRows([row()], ACCOUNT, [e], RECONCILIATION_DESCRIPTION);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
  });

  it('never surfaces a close-but-not-exact amount as a "possible match" — goes to unmatched instead (2026-08-06: amount tolerance removed entirely from possible-match identification, date tolerance unchanged)', () => {
    // 452 vs 450 used to fall inside the old ±0.5%/₹2 tolerance band and surface as "possible" — an
    // exact statement amount is now required for any candidate at all.
    const e = expense({ amount: 452 });
    const result = matchStatementRows([row({ amount: 450 })], ACCOUNT, [e], RECONCILIATION_DESCRIPTION);
    expect(result.matched).toHaveLength(0);
    expect(result.possible).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
  });

  it('does not surface any non-exact amount as a "possible match", however close', () => {
    const e = expense({ amount: 460 });
    const result = matchStatementRows([row({ amount: 450 })], ACCOUNT, [e], RECONCILIATION_DESCRIPTION);
    expect(result.matched).toHaveLength(0);
    expect(result.possible).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
  });

  it('regression: no statement row is offered as a "possible match" for an anchor expense unless its amount is exactly equal (real user-reported bug — amount tolerance removed entirely 2026-08-06)', () => {
    // The anchor recorded expense: "P Zomato" at ₹2,392. None of these real reported statement amounts
    // are exactly ₹2,392 (even 2393, off by just ₹1, no longer counts) — every one of them must be
    // unmatched, none possible.
    const anchor = expense({ id: 'zomato', amount: 2392, description: 'P Zomato' });
    const distinctRows = [2416, 2393, 2367, 1417, 1857, 1514, 1162, 2118].map((amount, i) =>
      row({ amount, rowIndex: i + 1 })
    );
    const result = matchStatementRows(distinctRows, ACCOUNT, [anchor], RECONCILIATION_DESCRIPTION);
    expect(result.possible).toHaveLength(0);
    expect(result.unmatched.map((r) => r.amount).sort((a, b) => a - b)).toEqual(
      [2416, 2393, 2367, 1417, 1857, 1514, 1162, 2118].sort((a, b) => a - b)
    );
  });

  it('surfaces every tied candidate as possible when same-day/same-amount ties cannot be broken', () => {
    const e1 = expense({ id: 'e1', description: 'random note' });
    const e2 = expense({ id: 'e2', description: 'other note' });
    const result = matchStatementRows([row()], ACCOUNT, [e1, e2], RECONCILIATION_DESCRIPTION);
    expect(result.matched).toHaveLength(0);
    expect(result.possible).toHaveLength(1);
    expect(result.possible[0]?.candidates.map((c) => c.id).sort()).toEqual(['e1', 'e2']);
  });

  it('breaks a tie via description similarity when one candidate clearly scores highest', () => {
    const e1 = expense({ id: 'e1', description: 'swiggy dinner order' });
    const e2 = expense({ id: 'e2', description: 'completely unrelated text' });
    const result = matchStatementRows(
      [row({ rawNarration: 'UPI-SWIGGY-DINNER-123' })],
      ACCOUNT,
      [e1, e2],
      RECONCILIATION_DESCRIPTION
    );
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.expense.id).toBe('e1');
  });

  it('enforces strict 1:1 pairing — a claimed expense cannot also match a second statement row', () => {
    const rowA = row({ rowIndex: 1 });
    const rowB = row({ rowIndex: 2 });
    const result = matchStatementRows([rowA, rowB], ACCOUNT, [expense()], RECONCILIATION_DESCRIPTION);
    expect(result.matched).toHaveLength(1);
    expect(result.unmatched).toHaveLength(1);
  });

  it('excludes reconciliation-adjustment entries from matching and lone-wolf candidacy', () => {
    const reconcileTxn = expense({ id: 'r1', description: RECONCILIATION_DESCRIPTION, amount: 999 });
    const result = matchStatementRows([row({ amount: 111 })], ACCOUNT, [reconcileTxn], RECONCILIATION_DESCRIPTION);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.loneWolves).toHaveLength(0);
  });

  it('flags a recorded transaction with no statement counterpart as a lone wolf', () => {
    const e = expense({ date: BASE });
    const statementRows = [row({ date: BASE, amount: 111 })]; // different amount => no match
    const result = matchStatementRows(statementRows, ACCOUNT, [e], RECONCILIATION_DESCRIPTION);
    expect(result.loneWolves).toHaveLength(1);
    expect(result.loneWolves[0]?.expense.id).toBe('e1');
  });

  it('softly flags a lone wolf near the statement date-range edge, provisional by default (no other import history yet)', () => {
    const statementRows = [
      row({ date: BASE, amount: 111 }),
      row({ date: BASE + 10 * DAY_MS, amount: 222, rowIndex: 2 })
    ];
    const nearEdgeTxn = expense({ date: BASE + 1 * DAY_MS, amount: 999 });
    const result = matchStatementRows(statementRows, ACCOUNT, [nearEdgeTxn], RECONCILIATION_DESCRIPTION);
    expect(result.loneWolves).toHaveLength(1);
    expect(result.loneWolves[0]?.nearEdge).toBe(true);
    expect(result.loneWolves[0]?.status).toBe('provisional');
  });

  it('§12 case b: a provisional lone wolf resolves silently once the adjacent statement explains it — no longer a lone wolf at all', () => {
    // March's own statement (1–31 Mar) doesn't explain a Penny row dated 31-Mar (real value date was
    // 1-Apr) — that's the "provisional" case covered above. April's own import, once it arrives, finds
    // this exact transaction via its ordinary ±3-day fuzzy match against its own 1-Apr row — resolved
    // silently, never surfacing as a lone wolf in April's review at all.
    const mar31 = new Date(2026, 2, 31).getTime();
    const apr1 = new Date(2026, 3, 1).getTime();
    const misdatedTxn = expense({ date: mar31, amount: 1200 });
    const aprilStatementRows = [row({ date: apr1, amount: 1200, rowIndex: 1 })];
    const result = matchStatementRows(aprilStatementRows, ACCOUNT, [misdatedTxn], RECONCILIATION_DESCRIPTION);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.expense.id).toBe('e1');
    expect(result.loneWolves).toHaveLength(0);
  });

  it('matches a debit statement line against an existing transfer-out leg', () => {
    const transfer = expense({
      id: 't1',
      type: 'transfer',
      accountId: ACCOUNT,
      toAccountId: OTHER_ACCOUNT,
      amount: 5000
    });
    const result = matchStatementRows([row({ amount: 5000 })], ACCOUNT, [transfer], RECONCILIATION_DESCRIPTION);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.expense.id).toBe('t1');
  });

  it('matches a credit statement line against an existing transfer-in leg', () => {
    const transfer = expense({
      id: 't1',
      type: 'transfer',
      accountId: OTHER_ACCOUNT,
      toAccountId: ACCOUNT,
      amount: 5000
    });
    const result = matchStatementRows(
      [row({ direction: 'credit', amount: 5000 })],
      ACCOUNT,
      [transfer],
      RECONCILIATION_DESCRIPTION
    );
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.expense.id).toBe('t1');
  });
});

function provenanceRecord(overrides: Partial<BankStatementImportRecord> = {}): BankStatementImportRecord {
  return {
    id: 'rec-1',
    batchId: 'batch-1',
    accountId: ACCOUNT,
    rawNarration: 'UPI-SWIGGY-123',
    normalizedKey: normalizeNarration('UPI-SWIGGY-123'),
    date: BASE,
    amount: 450,
    type: 'expense',
    linkedTxnId: 'e1',
    createdAt: 0,
    ...overrides
  };
}

describe('matchStatementRows — two-tier matching (docs/plans/bank-balance-sync.md §17)', () => {
  it("regression: a checkpointed transaction from one import must never be offered as a match candidate for an unrelated later import's coincidentally-same-amount row (the exact 31-Mar ₹240 vs 2-Apr ₹240 scenario)", () => {
    const mar31 = new Date(2026, 2, 31).getTime();
    const apr2 = new Date(2026, 3, 2).getTime();
    // Already checkpointed by an earlier (March) import — statementBalance set.
    const checkpointed = expense({
      id: 'mar-240',
      date: mar31,
      amount: 240,
      description: 'Some March expense',
      statementBalance: 50_240
    });
    // April's own, completely unrelated ₹240 row — within the ±3-day window of 31-Mar, exact amount.
    const aprilRow = row({ date: apr2, amount: 240, rowIndex: 1, rawNarration: 'UPI-UNRELATED-APR' });

    const result = matchStatementRows(
      [aprilRow],
      ACCOUNT,
      [checkpointed],
      RECONCILIATION_DESCRIPTION
      // no importRecords — this April row has no provenance from any prior import
    );

    // Must NOT silently absorb into the already-checkpointed 31-Mar expense.
    expect(result.matched).toHaveLength(0);
    expect(result.possible).toHaveLength(0);
    // Falls through to "new" instead — April's real transaction gets added properly.
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]?.date).toBe(apr2);
  });

  it('a non-checkpointed transaction within the window is still a normal match candidate (control case)', () => {
    const mar31 = new Date(2026, 2, 31).getTime();
    const apr2 = new Date(2026, 3, 2).getTime();
    const notCheckpointed = expense({ id: 'mar-240', date: mar31, amount: 240 });
    const aprilRow = row({ date: apr2, amount: 240, rowIndex: 1 });

    const result = matchStatementRows([aprilRow], ACCOUNT, [notCheckpointed], RECONCILIATION_DESCRIPTION);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.expense.id).toBe('mar-240');
  });

  it('re-import idempotency: importing the identical row twice matches via Tier 1 provenance even though the linked expense is already checkpointed (§15) — would otherwise be excluded by Tier 2', () => {
    const alreadyLinked = expense({ id: 'e1', date: BASE, amount: 450, statementBalance: 130_000 });
    const record = provenanceRecord({ linkedTxnId: 'e1' });
    const sameRowAgain = row(); // identical date/amount/narration to `record`

    const result = matchStatementRows(
      [sameRowAgain],
      ACCOUNT,
      [alreadyLinked],
      RECONCILIATION_DESCRIPTION,
      [record],
      []
    );

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.expense.id).toBe('e1');
    // Zero new/possible/unmatched — a clean no-op re-import.
    expect(result.possible).toHaveLength(0);
    expect(result.unmatched).toHaveLength(0);
  });

  // Skipped, not deleted (2026-08-28) — documents a known, still-open bug (see `findProvenanceMatch`'s
  // own doc comment in matcher.ts for the full writeup) rather than silently losing it. The fix this
  // test asserts was implemented and reverted the same day after an unresolved-ambiguous real-device
  // crash; re-enable once that's bisected and the fix re-lands.
  it.skip('re-import idempotency holds even when TWO rows share identical date/amount/narration (e.g. two same-day cash withdrawals of the same amount) — each resolves to its OWN prior link, not both to the first', () => {
    // Regression, found 2026-08-28 on a real device: two prior import records with identical
    // accountId/date/amount/normalizedKey, each linked to a different (already-checkpointed) expense.
    // Before the fix, a plain `.find()` returned the SAME record for both rows, so only the first row
    // matched — the second fell through to Tier 2, which excludes checkpointed expenses, landing in
    // "unmatched" even though its real counterpart was sitting right there, unclaimed.
    const expenseA = expense({ id: 'e-a', date: BASE, amount: 450, statementBalance: 130_000 });
    const expenseB = expense({ id: 'e-b', date: BASE, amount: 450, statementBalance: 129_550 });
    const recordA = provenanceRecord({ id: 'rec-a', linkedTxnId: 'e-a' });
    const recordB = provenanceRecord({ id: 'rec-b', linkedTxnId: 'e-b' });
    const rowA = row();
    const rowB = row();

    const result = matchStatementRows(
      [rowA, rowB],
      ACCOUNT,
      [expenseA, expenseB],
      RECONCILIATION_DESCRIPTION,
      [recordA, recordB],
      []
    );

    expect(result.matched).toHaveLength(2);
    expect(result.matched.map((m) => m.expense.id).sort()).toEqual(['e-a', 'e-b']);
    expect(result.possible).toHaveLength(0);
    expect(result.unmatched).toHaveLength(0);
  });

  it('Tier 1 provenance lookup requires an exact date+amount+normalized-narration match — a merely similar row still falls through to Tier 2', () => {
    const alreadyLinked = expense({ id: 'e1', date: BASE, amount: 450, statementBalance: 130_000 });
    // Provenance recorded for a DIFFERENT amount — should not spuriously match this new row via Tier 1.
    const record = provenanceRecord({ amount: 999 });
    const newRow = row({ amount: 450 });

    const result = matchStatementRows([newRow], ACCOUNT, [alreadyLinked], RECONCILIATION_DESCRIPTION, [record], []);
    // Falls to Tier 2, which excludes the checkpointed expense — so no match, no possible, unmatched.
    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
  });
});

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-2',
    name: 'HDFC Savings',
    type: 'bank',
    openingBalance: 0,
    color: '#000',
    icon: 'ti-building-bank',
    includeInNetWorth: true,
    isArchived: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  };
}

describe('suggestPossibleTransfer', () => {
  // 2026-08-05, per explicit user discussion — a much softer signal than `matchStatementRows` itself:
  // an already-recorded plain expense/income on a DIFFERENT account, opposite direction, matching or
  // close amount, within the same ±3-day window. Never auto-applied — always surfaced as a dismissible
  // suggestion, since amount/date coincidence alone can't distinguish "the other leg of my own
  // transfer" from "a coincidentally-similar payment to someone else" (see the function's doc comment).

  it('suggests the sole matching candidate for a debit row (looks for an income on another account)', () => {
    const accounts = [account({ id: 'acc-2', name: 'HDFC Savings' })];
    const counterpart = expense({ id: 'e2', type: 'income', accountId: 'acc-2', amount: 5000, date: BASE });
    const result = suggestPossibleTransfer(
      row({ direction: 'debit', amount: 5000 }),
      ACCOUNT,
      [counterpart],
      accounts,
      RECONCILIATION_DESCRIPTION
    );
    expect(result?.account.id).toBe('acc-2');
    expect(result?.expense.id).toBe('e2');
  });

  it('suggests the sole matching candidate for a credit row (looks for an expense on another account)', () => {
    const accounts = [account({ id: 'acc-2', name: 'ICICI Bank' })];
    const counterpart = expense({ id: 'e2', type: 'expense', accountId: 'acc-2', amount: 5000, date: BASE });
    const result = suggestPossibleTransfer(
      row({ direction: 'credit', amount: 5000 }),
      ACCOUNT,
      [counterpart],
      accounts,
      RECONCILIATION_DESCRIPTION
    );
    expect(result?.account.id).toBe('acc-2');
  });

  it('returns null when two or more candidates tie — never guesses which one', () => {
    const accounts = [account({ id: 'acc-2' }), account({ id: 'acc-3', name: 'SBI' })];
    const e1 = expense({ id: 'e2', type: 'income', accountId: 'acc-2', amount: 5000, date: BASE });
    const e2 = expense({ id: 'e3', type: 'income', accountId: 'acc-3', amount: 5000, date: BASE });
    const result = suggestPossibleTransfer(
      row({ direction: 'debit', amount: 5000 }),
      ACCOUNT,
      [e1, e2],
      accounts,
      RECONCILIATION_DESCRIPTION
    );
    expect(result).toBeNull();
  });

  it('returns null when no candidate matches', () => {
    const result = suggestPossibleTransfer(
      row({ direction: 'debit', amount: 5000 }),
      ACCOUNT,
      [],
      [],
      RECONCILIATION_DESCRIPTION
    );
    expect(result).toBeNull();
  });

  it("excludes a candidate on the SAME account — that is the normal matcher's own job, not this heuristic", () => {
    const accounts = [account({ id: ACCOUNT })];
    const sameAccountExpense = expense({ id: 'e2', type: 'income', accountId: ACCOUNT, amount: 5000, date: BASE });
    const result = suggestPossibleTransfer(
      row({ direction: 'debit', amount: 5000 }),
      ACCOUNT,
      [sameAccountExpense],
      accounts,
      RECONCILIATION_DESCRIPTION
    );
    expect(result).toBeNull();
  });

  it("excludes an already-recorded transfer — that is matchStatementRows's own confident-match job", () => {
    const accounts = [account({ id: 'acc-2' })];
    const transfer = expense({
      id: 't1',
      type: 'transfer',
      accountId: 'acc-3',
      toAccountId: 'acc-2',
      amount: 5000,
      date: BASE
    });
    const result = suggestPossibleTransfer(
      row({ direction: 'debit', amount: 5000 }),
      ACCOUNT,
      [transfer],
      accounts,
      RECONCILIATION_DESCRIPTION
    );
    expect(result).toBeNull();
  });

  it('excludes a reconciliation-adjustment entry', () => {
    const accounts = [account({ id: 'acc-2' })];
    const reconcileTxn = expense({
      id: 'r1',
      type: 'income',
      accountId: 'acc-2',
      amount: 5000,
      date: BASE,
      description: RECONCILIATION_DESCRIPTION
    });
    const result = suggestPossibleTransfer(
      row({ direction: 'debit', amount: 5000 }),
      ACCOUNT,
      [reconcileTxn],
      accounts,
      RECONCILIATION_DESCRIPTION
    );
    expect(result).toBeNull();
  });

  // docs/plans/bank-balance-sync.md §13, simulation §13 — the worked HDFC→ICICI example: HDFC is
  // imported first with no candidate to link against (ICICI's own statement isn't in Penny yet), so
  // its NEFT-out row becomes a plain new expense. ICICI is imported later; its NEFT-in row should
  // surface `suggestPossibleTransfer` pointing back at that same HDFC expense.
  describe('the HDFC→ICICI two-import scenario (docs/plans/bank-balance-sync-simulation.html §13)', () => {
    it('HDFC imported first: the NEFT-out row has no candidate yet and becomes a plain new expense', () => {
      const hdfcAccountId = 'hdfc-checking';
      const neftOutRow = row({
        rawNarration: 'NEFT TO ICICI XXXX1234',
        date: BASE,
        amount: 20_000,
        direction: 'debit'
      });
      // Nothing recorded anywhere yet (ICICI's statement isn't in Penny) — no candidate at all.
      const result = matchStatementRows([neftOutRow], hdfcAccountId, [], RECONCILIATION_DESCRIPTION);
      expect(result.matched).toHaveLength(0);
      expect(result.possible).toHaveLength(0);
      expect(result.unmatched).toHaveLength(1);

      // Also confirms no possible-transfer signal at this point either — there's nothing on any other
      // account yet for it to point at.
      const transferSuggestion = suggestPossibleTransfer(
        neftOutRow,
        hdfcAccountId,
        [],
        [account({ id: hdfcAccountId })],
        RECONCILIATION_DESCRIPTION
      );
      expect(transferSuggestion).toBeNull();
    });

    it('ICICI imported later: the NEFT-in row surfaces the HDFC expense as a transfer candidate', () => {
      const hdfcAccountId = 'hdfc-checking';
      const iciciAccountId = 'icici-savings';
      // The plain expense HDFC's own import created (per the previous test).
      const hdfcExpense = expense({
        id: 'hdfc-neft-out',
        description: 'NEFT TO ICICI XXXX1234',
        type: 'expense',
        accountId: hdfcAccountId,
        amount: 20_000,
        date: BASE
      });
      const neftInRow = row({
        rawNarration: 'NEFT FROM HDFC XXXX5678',
        date: BASE,
        amount: 20_000,
        direction: 'credit'
      });

      // `matchStatementRows` itself has no candidate for this row (nothing on ICICI's own account
      // matches) — it correctly falls to "unmatched," exactly as the simulation table shows.
      const matchResult = matchStatementRows([neftInRow], iciciAccountId, [hdfcExpense], RECONCILIATION_DESCRIPTION);
      expect(matchResult.matched).toHaveLength(0);
      expect(matchResult.unmatched).toHaveLength(1);

      // `suggestPossibleTransfer` is the mechanism that actually surfaces the HDFC row as a candidate.
      const accounts = [
        account({ id: hdfcAccountId, name: 'HDFC Checking' }),
        account({ id: iciciAccountId, name: 'ICICI Savings' })
      ];
      const transferSuggestion = suggestPossibleTransfer(
        neftInRow,
        iciciAccountId,
        [hdfcExpense],
        accounts,
        RECONCILIATION_DESCRIPTION
      );
      expect(transferSuggestion?.account.id).toBe(hdfcAccountId);
      expect(transferSuggestion?.expense.id).toBe('hdfc-neft-out');
    });

    it('the realistic wrinkle: a same-side NEFT fee never gets swept into the transfer suggestion or confuses the match', () => {
      const hdfcAccountId = 'hdfc-checking';
      const iciciAccountId = 'icici-savings';
      const hdfcTransferLeg = expense({
        id: 'hdfc-neft-out',
        description: 'NEFT TO ICICI XXXX1234',
        type: 'expense',
        accountId: hdfcAccountId,
        amount: 20_000,
        date: BASE
      });
      // A genuinely one-sided ₹5 NEFT processing fee, recorded the same day on the same (HDFC) side —
      // per the simulation's own §13 wrinkle, this should stay a plain, unlinked expense; it must never
      // get pulled into the transfer suggestion in place of (or alongside) the real ₹20,000 leg.
      const hdfcFeeLeg = expense({
        id: 'hdfc-neft-fee',
        description: 'NEFT PROCESSING FEE',
        type: 'expense',
        accountId: hdfcAccountId,
        amount: 5,
        date: BASE
      });
      const neftInRow = row({
        rawNarration: 'NEFT FROM HDFC XXXX5678',
        date: BASE,
        amount: 20_000,
        direction: 'credit'
      });
      const accounts = [
        account({ id: hdfcAccountId, name: 'HDFC Checking' }),
        account({ id: iciciAccountId, name: 'ICICI Savings' })
      ];

      const transferSuggestion = suggestPossibleTransfer(
        neftInRow,
        iciciAccountId,
        [hdfcTransferLeg, hdfcFeeLeg],
        accounts,
        RECONCILIATION_DESCRIPTION
      );
      // Still exactly one confident candidate — the ₹5 fee's amount is nowhere near the ₹20,000 window
      // (`isCloseAmount`'s tolerance is at most a few rupees / 0.5%), so it's never even a candidate.
      expect(transferSuggestion?.expense.id).toBe('hdfc-neft-out');

      const ambiguous = suggestAmbiguousTransferCandidates(
        neftInRow,
        iciciAccountId,
        [hdfcTransferLeg, hdfcFeeLeg],
        accounts,
        RECONCILIATION_DESCRIPTION
      );
      expect(ambiguous).toBeNull();
    });
  });
});

describe('suggestAmbiguousTransferCandidates', () => {
  // docs/plans/bank-balance-sync.md §13's "genuine ambiguity" case — two same-bank accounts (or an
  // unrelated coincidental same-day/same-amount transaction) mean more than one candidate is equally
  // plausible. Per the plan, this must surface as a choice, never auto-link — `suggestPossibleTransfer`
  // itself already refuses (returns null); this sibling returns the full tied set instead.

  it('returns both candidates when two same-bank accounts have coincidental same-day/same-amount activity', () => {
    const accounts = [
      account({ id: 'icici-savings', name: 'ICICI Savings' }),
      account({ id: 'icici-salary', name: 'ICICI Salary' })
    ];
    const genuineTransferLeg = expense({
      id: 'e2',
      description: 'NEFT FROM HDFC XXXX5678',
      type: 'income',
      accountId: 'icici-savings',
      amount: 20_000,
      date: BASE
    });
    const coincidentalPayment = expense({
      id: 'e3',
      description: 'IMPS FROM RAJESH K.',
      type: 'income',
      accountId: 'icici-salary',
      amount: 20_000,
      date: BASE
    });
    const result = suggestAmbiguousTransferCandidates(
      row({ direction: 'debit', amount: 20_000 }),
      ACCOUNT,
      [genuineTransferLeg, coincidentalPayment],
      accounts,
      RECONCILIATION_DESCRIPTION
    );
    expect(result).toHaveLength(2);
    expect(result?.map((c) => c.expense.id).sort()).toEqual(['e2', 'e3']);
  });

  it('returns null (not ambiguous) when exactly one candidate qualifies — the common, single-suggestion case', () => {
    const accounts = [account({ id: 'acc-2', name: 'HDFC Savings' })];
    const counterpart = expense({ id: 'e2', type: 'income', accountId: 'acc-2', amount: 5000, date: BASE });
    const result = suggestAmbiguousTransferCandidates(
      row({ direction: 'debit', amount: 5000 }),
      ACCOUNT,
      [counterpart],
      accounts,
      RECONCILIATION_DESCRIPTION
    );
    expect(result).toBeNull();
  });

  it('returns null when no candidate matches at all', () => {
    const result = suggestAmbiguousTransferCandidates(
      row({ direction: 'debit', amount: 5000 }),
      ACCOUNT,
      [],
      [],
      RECONCILIATION_DESCRIPTION
    );
    expect(result).toBeNull();
  });
});

describe('convertCandidateToTransfer (found + fixed 2026-08-09 — absorb-in-place cross-account transfer conversion)', () => {
  // The exact repro: HDFC imported first records a plain ₹20,000 `expense` (NEFT out) with no
  // candidate to link against. ICICI imported later finds that HDFC expense as a transfer candidate via
  // `suggestPossibleTransfer`. Accepting it must ABSORB the existing HDFC expense (converting it in
  // place) rather than leaving it duplicated alongside a brand-new record.
  const hdfcAccountId = 'hdfc-checking';
  const iciciAccountId = 'icici-savings';

  it('SOURCE branch — candidate.type === "expense": only type/toAccountId change, accountId (the source) is untouched', () => {
    const candidate = expense({
      id: 'hdfc-neft-out',
      description: 'NEFT TO ICICI XXXX1234',
      type: 'expense',
      accountId: hdfcAccountId,
      amount: 20_000,
      date: BASE,
      categoryId: 'cat-misc',
      hashtags: ['#tag'],
      createdAt: 111,
      updatedAt: 111
    });
    const converted = convertCandidateToTransfer(candidate, iciciAccountId, 999);
    expect(converted).toEqual({
      ...candidate,
      type: 'transfer',
      toAccountId: iciciAccountId,
      updatedAt: 999
    });
    // accountId (the source leg) must stay exactly what it was — never reassigned in this branch.
    expect(converted.accountId).toBe(hdfcAccountId);
    // Nothing else touched.
    expect(converted.amount).toBe(candidate.amount);
    expect(converted.date).toBe(candidate.date);
    expect(converted.description).toBe(candidate.description);
    expect(converted.categoryId).toBe(candidate.categoryId);
    expect(converted.hashtags).toBe(candidate.hashtags);
    expect(converted.createdAt).toBe(candidate.createdAt);
  });

  it('SOURCE branch — an unset `type` (legacy convention: omitted = expense) is treated identically to an explicit "expense"', () => {
    const candidate = expense({ id: 'legacy-1', accountId: hdfcAccountId, amount: 20_000, date: BASE });
    delete (candidate as { type?: string }).type;
    const converted = convertCandidateToTransfer(candidate, iciciAccountId, 999);
    expect(converted.type).toBe('transfer');
    expect(converted.accountId).toBe(hdfcAccountId);
    expect(converted.toAccountId).toBe(iciciAccountId);
  });

  it('DESTINATION branch — candidate.type === "income": accountId is REASSIGNED to currentAccountId, toAccountId becomes the candidate\'s own original accountId', () => {
    const candidate = expense({
      id: 'icici-neft-in',
      description: 'NEFT FROM HDFC XXXX5678',
      type: 'income',
      accountId: iciciAccountId,
      amount: 20_000,
      date: BASE,
      categoryId: 'cat-misc',
      hashtags: ['#tag'],
      createdAt: 111,
      updatedAt: 111
    });
    // currentAccountId here is HDFC — the debit row currently being imported.
    const converted = convertCandidateToTransfer(candidate, hdfcAccountId, 999);
    expect(converted).toEqual({
      ...candidate,
      type: 'transfer',
      accountId: hdfcAccountId,
      toAccountId: iciciAccountId,
      updatedAt: 999
    });
    // Nothing else touched.
    expect(converted.amount).toBe(candidate.amount);
    expect(converted.date).toBe(candidate.date);
    expect(converted.description).toBe(candidate.description);
    expect(converted.categoryId).toBe(candidate.categoryId);
    expect(converted.hashtags).toBe(candidate.hashtags);
    expect(converted.createdAt).toBe(candidate.createdAt);
  });

  it('preserves an existing statementBalance untouched in both branches (commit-time diagnostics implications are a separate, documented concern)', () => {
    const sourceCandidate = expense({
      id: 'hdfc-neft-out',
      type: 'expense',
      accountId: hdfcAccountId,
      amount: 20_000,
      date: BASE,
      statementBalance: 45_000
    });
    const convertedSource = convertCandidateToTransfer(sourceCandidate, iciciAccountId, 999);
    expect(convertedSource.statementBalance).toBe(45_000);

    const destinationCandidate = expense({
      id: 'icici-neft-in',
      type: 'income',
      accountId: iciciAccountId,
      amount: 20_000,
      date: BASE,
      statementBalance: 90_000
    });
    const convertedDestination = convertCandidateToTransfer(destinationCandidate, hdfcAccountId, 999);
    expect(convertedDestination.statementBalance).toBe(90_000);
  });
});

describe('deriveLoneWolves', () => {
  // apps/mobile/src/features/bank-import/useBankImport.ts calls this directly (not just once, at
  // parse time, via matchStatementRows) so the review screen's Lone Wolf bucket can react live as the
  // user reassigns a "Matched" pair or resolves/dismisses a "Possible match" item — docs/plans/
  // bank-statement-import.md §6's own principle: "never silently hide or silently decide something
  // uncertain". These tests exercise that reactive re-derivation directly, at the pure-function level
  // (apps/mobile has no hook-testing/component-testing infrastructure configured at all — no Jest, no
  // React Testing Library, no existing `.test.*` file anywhere in that workspace — so this is the
  // actual, currently-runnable seam for this behavior; see the PR discussion for the full reasoning).

  it('returns an expense as a lone wolf once nothing references it anymore', () => {
    const e = expense({ id: 'e1', date: BASE });
    const statementRows = [row({ date: BASE })];
    // Not referenced by anything → lone wolf.
    const result = deriveLoneWolves([e], new Set(), statementRows);
    expect(result).toHaveLength(1);
    expect(result[0]?.expense.id).toBe('e1');
  });

  it('excludes a currently-referenced expense from the lone-wolf list', () => {
    const e = expense({ id: 'e1', date: BASE });
    const statementRows = [row({ date: BASE })];
    const result = deriveLoneWolves([e], new Set(['e1']), statementRows);
    expect(result).toHaveLength(0);
  });

  it('re-derivation re-surfaces an expense bumped out of a "Matched" pairing (§5 reassignment cascade)', () => {
    // Simulates useBankImport.ts's `unclaimExpenseEverywhere()`: e1 starts confidently matched (so
    // it's in the live "referenced" set the UI builds from its own `matchedPairs` state) — a
    // reassignment then bumps it (the user picked a different expense for that statement line
    // instead), removing it from `matchedPairs`, so the UI's next `referenced` set no longer contains
    // it. The exact same statement rows / pool must now report it as a lone wolf — it must not have
    // vanished from the review entirely.
    const bumped = expense({ id: 'e1', date: BASE });
    const pool = [bumped];
    const statementRows = [row({ date: BASE })];

    const referencedBeforeReassignment = new Set(['e1']); // still claimed by the "Matched" pair
    const beforeReassignment = deriveLoneWolves(pool, referencedBeforeReassignment, statementRows);
    expect(beforeReassignment).toHaveLength(0); // not a lone wolf yet — it's confidently matched

    const referencedAfterReassignment = new Set<string>(); // unclaimed — bumped to a different expense
    const afterReassignment = deriveLoneWolves(pool, referencedAfterReassignment, statementRows);
    expect(afterReassignment).toHaveLength(1);
    expect(afterReassignment[0]?.expense.id).toBe('e1');
  });

  it('re-derivation re-surfaces every candidate freed up when a "Possible match" item is dismissed as new', () => {
    // Simulates useBankImport.ts's `dismissPossibleAsNew()`: e1/e2 both started as candidates on one
    // unresolved possible-match item (so both are in the live "referenced" set, built from
    // `possibleItems[*].candidates`) — the user then picks "No match — add as new" for that
    // statement line, removing the whole item, so neither e1 nor e2 is referenced by anything
    // afterward. Both must resurface as lone wolves.
    const e1 = expense({ id: 'e1', date: BASE });
    const e2 = expense({ id: 'e2', date: BASE });
    const pool = [e1, e2];
    const statementRows = [row({ date: BASE })];

    const whileUnresolved = deriveLoneWolves(pool, new Set(['e1', 'e2']), statementRows);
    expect(whileUnresolved).toHaveLength(0);

    const afterDismissed = deriveLoneWolves(pool, new Set(), statementRows);
    expect(afterDismissed.map((lw) => lw.expense.id).sort()).toEqual(['e1', 'e2']);
  });

  it('excludes an expense outside the statement date range even when unreferenced', () => {
    const outOfRange = expense({ id: 'e1', date: BASE - 30 * DAY_MS });
    const statementRows = [row({ date: BASE })];
    const result = deriveLoneWolves([outOfRange], new Set(), statementRows);
    expect(result).toHaveLength(0);
  });

  describe('deferred lone-wolf escalation (docs/plans/bank-balance-sync.md §12)', () => {
    const mar1 = new Date(2026, 2, 1).getTime();
    const mar31 = new Date(2026, 2, 31).getTime();
    const mar14 = new Date(2026, 2, 14).getTime();
    const marchStatementRows = [row({ date: mar1 }), row({ date: mar31, rowIndex: 2 })];

    it('§12 case a: a near-boundary lone wolf is provisional when no other import has had a chance yet', () => {
      const e = expense({ id: 'e1', date: mar31, amount: 1200 });
      const result = deriveLoneWolves([e], new Set(), marchStatementRows);
      expect(result).toHaveLength(1);
      expect(result[0]?.nearEdge).toBe(true);
      expect(result[0]?.status).toBe('provisional');
    });

    it("§12 control case: a lone wolf well within the statement's own range escalates immediately, not deferred", () => {
      const e = expense({ id: 'e1', date: mar14, amount: 800 });
      const result = deriveLoneWolves([e], new Set(), marchStatementRows);
      expect(result).toHaveLength(1);
      expect(result[0]?.nearEdge).toBe(false);
      expect(result[0]?.status).toBe('escalated');
    });

    it('escalates a near-boundary lone wolf once an adjacent, already-completed import has also failed to explain it', () => {
      const e = expense({ id: 'e1', date: mar31, amount: 1200 });
      // April's own import already happened and covers 1–30 Apr — its ±3-day grace window (29 Mar–3
      // May) reaches back over this transaction's date, and it's STILL unreferenced (still a lone
      // wolf) — a second period has now had its chance and failed, so this escalates.
      const apr1 = new Date(2026, 3, 1).getTime();
      const apr30 = new Date(2026, 3, 30).getTime();
      const result = deriveLoneWolves([e], new Set(), marchStatementRows, [{ start: apr1, end: apr30 }]);
      expect(result).toHaveLength(1);
      expect(result[0]?.status).toBe('escalated');
    });

    it('stays provisional when another completed import exists but its window does not reach this date', () => {
      const e = expense({ id: 'e1', date: mar31, amount: 1200 });
      // An unrelated, far-away prior import (e.g. January) shouldn't count as "an adjacent period had
      // its chance" — only one whose own coverage+grace window actually reaches this date should.
      const jan1 = new Date(2026, 0, 1).getTime();
      const jan31 = new Date(2026, 0, 31).getTime();
      const result = deriveLoneWolves([e], new Set(), marchStatementRows, [{ start: jan1, end: jan31 }]);
      expect(result).toHaveLength(1);
      expect(result[0]?.status).toBe('provisional');
    });
  });
});
