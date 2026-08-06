import { describe, expect, it } from 'vitest';
import { matchStatementRows, deriveLoneWolves, suggestPossibleTransfer } from '@/core/bank-import/matcher';
import type { ParsedStatementRow } from '@/core/bank-import/types';
import type { Account, Expense } from '@/core/db/types';

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

  it('softly flags a lone wolf near the statement date-range edge', () => {
    const statementRows = [
      row({ date: BASE, amount: 111 }),
      row({ date: BASE + 10 * DAY_MS, amount: 222, rowIndex: 2 })
    ];
    const nearEdgeTxn = expense({ date: BASE + 1 * DAY_MS, amount: 999 });
    const result = matchStatementRows(statementRows, ACCOUNT, [nearEdgeTxn], RECONCILIATION_DESCRIPTION);
    expect(result.loneWolves).toHaveLength(1);
    expect(result.loneWolves[0]?.nearEdge).toBe(true);
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
});
