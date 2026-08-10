import { describe, expect, it } from 'vitest';
import { attachCheckpoint, reconcileMatchedExpense } from '@/core/bank-import/checkpoint';
import type { ParsedStatementRow } from '@/core/bank-import/types';
import type { Expense } from '@/core/db/types';

const BASE = new Date(2026, 5, 14).getTime(); // 14 Jun 2026
const DAY_MS = 86_400_000;

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
    accountId: 'acc-1',
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  };
}

describe('attachCheckpoint (docs/plans/bank-balance-sync.md §5/§7)', () => {
  it('sets statementBalance when the mapping has a balance column and the row carries a value', () => {
    const result = attachCheckpoint(expense(), row({ balance: 130_000 }), true, 'acc-1');
    expect(result.statementBalance).toBe(130_000);
  });

  it('leaves the expense unchanged when the mapping has no balance column', () => {
    const original = expense();
    const result = attachCheckpoint(original, row({ balance: 130_000 }), false, 'acc-1');
    expect(result.statementBalance).toBeUndefined();
    expect(result).toBe(original); // same reference — genuinely a no-op
  });

  it('leaves the expense unchanged when the mapping has a balance column but this row has no value (a gap)', () => {
    const original = expense();
    const result = attachCheckpoint(original, row({ balance: undefined }), true, 'acc-1');
    expect(result.statementBalance).toBeUndefined();
    expect(result).toBe(original);
  });

  it("does not attach a checkpoint when a new transfer row's own accountId is the OTHER side of the transfer, not the currently-importing account (found + fixed 2026-08-09)", () => {
    // A credit-direction row during ICICI's own import creates a transfer whose accountId ends up being
    // the source (HDFC) — see useBankImport.ts's direction-swap construction — so ICICI's own balance
    // column must never land on this row's statementBalance.
    const original = expense({ accountId: 'hdfc', toAccountId: 'icici', type: 'transfer' });
    const result = attachCheckpoint(original, row({ balance: 500_000 }), true, 'icici');
    expect(result.statementBalance).toBeUndefined();
    expect(result).toBe(original);
  });

  it('still attaches a checkpoint for a new transfer row whose own accountId IS the currently-importing account (regression)', () => {
    const result = attachCheckpoint(
      expense({ accountId: 'hdfc', toAccountId: 'icici', type: 'transfer' }),
      row({ balance: 130_000 }),
      true,
      'hdfc'
    );
    expect(result.statementBalance).toBe(130_000);
  });
});

describe('reconcileMatchedExpense (docs/plans/bank-balance-sync.md §5/§8)', () => {
  it('returns undefined when nothing about the matched pair actually changed', () => {
    const e = expense({ date: BASE, amount: 450 });
    const result = reconcileMatchedExpense(e, row({ date: BASE, amount: 450 }), false, Date.now(), 'acc-1');
    expect(result).toBeUndefined();
  });

  it("corrects the expense's date to the statement row's date when they differ", () => {
    const e = expense({ date: BASE - 2 * DAY_MS });
    const now = Date.now();
    const result = reconcileMatchedExpense(e, row({ date: BASE }), false, now, 'acc-1');
    expect(result?.date).toBe(BASE);
    expect(result?.updatedAt).toBe(now);
  });

  it("corrects the expense's amount to the statement row's exact amount when they differ (a user-resolved possible match)", () => {
    const e = expense({ amount: 448 }); // close-but-not-exact — only reachable via a manual reassignment
    const now = Date.now();
    const result = reconcileMatchedExpense(e, row({ amount: 450 }), false, now, 'acc-1');
    expect(result?.amount).toBe(450);
  });

  it('attaches statementBalance alongside date/amount corrections when the mapping has a balance column', () => {
    const e = expense({ date: BASE - DAY_MS, amount: 448 });
    const result = reconcileMatchedExpense(
      e,
      row({ date: BASE, amount: 450, balance: 130_000 }),
      true,
      Date.now(),
      'acc-1'
    );
    expect(result?.date).toBe(BASE);
    expect(result?.amount).toBe(450);
    expect(result?.statementBalance).toBe(130_000);
  });

  it('does not attach statementBalance when the mapping has no balance column, even if other fields changed', () => {
    const e = expense({ date: BASE - DAY_MS });
    const result = reconcileMatchedExpense(e, row({ date: BASE }), false, Date.now(), 'acc-1');
    expect(result?.date).toBe(BASE);
    expect(result?.statementBalance).toBeUndefined();
  });

  it('is a no-op when the mapping has a balance column but the checkpoint value is already identical', () => {
    const e = expense({ statementBalance: 130_000 });
    const result = reconcileMatchedExpense(e, row({ balance: 130_000 }), true, Date.now(), 'acc-1');
    expect(result).toBeUndefined();
  });

  it('does NOT overwrite an already-correct checkpoint when a transfer is re-matched from its OTHER (toAccountId) side (found + fixed 2026-08-09 — the actual corruption bug)', () => {
    // HDFC's own import already checkpointed this transfer correctly. ICICI (toAccountId) later imports
    // its own statement, and this same expense legitimately matches one of ICICI's rows too (the
    // candidate pool includes e.toAccountId === accountId) — but ICICI's own balance must never land here.
    const e = expense({
      accountId: 'hdfc',
      toAccountId: 'icici',
      type: 'transfer',
      statementBalance: 130_000
    });
    const result = reconcileMatchedExpense(e, row({ balance: 999_999 }), true, Date.now(), 'icici');
    // Nothing changed (date/amount already match the row's defaults, and the checkpoint guard blocks
    // the balance write) so this is a true no-op.
    expect(result).toBeUndefined();
  });

  it('still corrects date/amount for a transfer re-matched from its OTHER side, even though the checkpoint itself is guarded (direction-agnostic correction)', () => {
    const e = expense({
      accountId: 'hdfc',
      toAccountId: 'icici',
      type: 'transfer',
      date: BASE - DAY_MS,
      statementBalance: 130_000
    });
    const result = reconcileMatchedExpense(e, row({ date: BASE, balance: 999_999 }), true, Date.now(), 'icici');
    expect(result?.date).toBe(BASE);
    expect(result?.statementBalance).toBe(130_000); // untouched — still HDFC's original value
  });

  it('still attaches/corrects the checkpoint for a transfer matched from its OWN accountId side (regression)', () => {
    const e = expense({ accountId: 'hdfc', toAccountId: 'icici', type: 'transfer' });
    const result = reconcileMatchedExpense(e, row({ balance: 130_000 }), true, Date.now(), 'hdfc');
    expect(result?.statementBalance).toBe(130_000);
  });
});
