import { describe, expect, it } from 'vitest';
import { reconcilePpfRows } from '@/core/portfolio/ppfReconciliation';
import type { ParsedPpfStatementRow } from '@/core/portfolio/ppfStatementParser';
import type { PpfRateTable } from '@/core/portfolio/ppfInterestRates';
import type { PpfTransaction } from '@/core/db/types';

const FLAT_RATE_TABLE: PpfRateTable = {
  confirmedThrough: '2025-03-31',
  periods: [{ effectiveFrom: '2020-04-01', ratePct: 7.1 }]
};

function ms(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d).getTime();
}

function parsedRow(overrides: Partial<ParsedPpfStatementRow> = {}): ParsedPpfStatementRow {
  return {
    date: ms(2023, 4, 1),
    type: 'deposit',
    amount: 150000,
    narration: 'Cash Deposit',
    rowIndex: 2,
    ...overrides
  };
}

function txn(overrides: Partial<PpfTransaction> = {}): PpfTransaction {
  return { id: 'existing-1', type: 'deposit', date: ms(2023, 4, 1), amount: 150000, ...overrides };
}

describe('reconcilePpfRows', () => {
  it('classifies a row with no existing match as "new"', () => {
    const [item] = reconcilePpfRows([parsedRow()], []);
    expect(item?.kind).toBe('new');
  });

  it('classifies a row matching an existing same-day, same-type, same-amount transaction as "matches"', () => {
    const existing = txn();
    const [item] = reconcilePpfRows([parsedRow()], [existing]);
    expect(item?.kind).toBe('matches');
    expect(item?.existing).toBe(existing);
  });

  it('classifies a same-day, same-type, different-amount transaction as "conflict"', () => {
    const existing = txn({ amount: 100000 });
    const [item] = reconcilePpfRows([parsedRow({ amount: 150000 })], [existing]);
    expect(item?.kind).toBe('conflict');
  });

  it('does not match a deposit against a withdrawal on the same day (type is part of the key)', () => {
    const existing = txn({ type: 'withdrawal', amount: 150000 });
    const [item] = reconcilePpfRows([parsedRow({ type: 'deposit', amount: 150000 })], [existing]);
    expect(item?.kind).toBe('new');
  });

  it('matches an interest row against an existing interest transaction anywhere in the same FY, not just the same day', () => {
    const existing = txn({ type: 'interest', date: ms(2024, 3, 31), amount: 10650 });
    const imported = parsedRow({
      type: 'interest',
      date: ms(2024, 3, 28),
      amount: 10650,
      narration: 'Interest Credited'
    });
    const [item] = reconcilePpfRows([imported], [existing]);
    expect(item?.kind).toBe('matches');
  });

  it('populates calculatedInterest for an interest row when a rate table is supplied', () => {
    const deposit = parsedRow({ type: 'deposit', date: ms(2023, 4, 1), amount: 150000 });
    const interest = parsedRow({
      type: 'interest',
      date: ms(2024, 3, 31),
      amount: 10650,
      narration: 'Interest Credited'
    });
    const items = reconcilePpfRows([deposit, interest], [], FLAT_RATE_TABLE);
    const interestItem = items.find((i) => i.type === 'interest');
    expect(interestItem?.calculatedInterest).toEqual({
      amount: 10650,
      basedOnIncompleteHistory: false,
      mismatched: false
    });
  });

  it('flags calculatedInterest.mismatched when the imported interest disagrees with the recalculation', () => {
    const deposit = parsedRow({ type: 'deposit', date: ms(2023, 4, 1), amount: 150000 });
    const interest = parsedRow({ type: 'interest', date: ms(2024, 3, 31), amount: 3000, narration: 'Interest' });
    const items = reconcilePpfRows([deposit, interest], [], FLAT_RATE_TABLE);
    const interestItem = items.find((i) => i.type === 'interest');
    expect(interestItem?.calculatedInterest?.mismatched).toBe(true);
  });

  it("carries a prior FY's own credited interest (elsewhere in the same freshly-imported statement) into the next FY's balance basis — regression for the 2026-08-24 bug where the statement-side filter excluded ALL interest rows instead of just the current FY's own", () => {
    const deposit = parsedRow({ type: 'deposit', date: ms(2023, 4, 1), amount: 150000 });
    const interestFy1 = parsedRow({
      type: 'interest',
      date: ms(2024, 3, 31),
      amount: 10650,
      narration: 'Interest Credited'
    });
    // No further deposits/withdrawals in FY2024-25 — its balance basis is entirely last FY's closing
    // balance, which only exists because FY1's own interest (credited elsewhere in this SAME
    // statement, not yet in any pre-existing ledger) is correctly still in context: 150000 + 10650 =
    // 160650, × 7.1% = 11406.15 → rounds to 11406. Before the fix, FY1's interest was stripped out of
    // context entirely, leaving just the original 150000 deposit — recomputing 10650 all over again
    // instead of 11406, silently understating every year after the first.
    const interestFy2 = parsedRow({
      type: 'interest',
      date: ms(2025, 3, 31),
      amount: 11406,
      narration: 'Interest Credited'
    });
    const items = reconcilePpfRows([deposit, interestFy1, interestFy2], [], FLAT_RATE_TABLE);
    const fy2Item = items.find((i) => i.type === 'interest' && i.date === ms(2025, 3, 31));
    expect(fy2Item?.calculatedInterest).toEqual({ amount: 11406, basedOnIncompleteHistory: false, mismatched: false });
  });

  it('leaves calculatedInterest undefined for non-interest rows', () => {
    const items = reconcilePpfRows([parsedRow({ type: 'deposit' })], [], FLAT_RATE_TABLE);
    expect(items[0]?.calculatedInterest).toBeUndefined();
  });

  it('never silently drops or reorders rows — output length and order matches input', () => {
    const rows = [parsedRow({ date: ms(2023, 4, 1) }), parsedRow({ date: ms(2023, 5, 1), type: 'withdrawal' })];
    const items = reconcilePpfRows(rows, []);
    expect(items).toHaveLength(2);
    expect(items[0]?.date).toBe(rows[0]?.date);
    expect(items[1]?.date).toBe(rows[1]?.date);
  });
});
