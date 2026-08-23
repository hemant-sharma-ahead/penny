import { describe, expect, it } from 'vitest';
import { identifyRedundantCarryForwardRows } from '@/core/import/importCarryForward';
import type { ParsedRow } from '@/core/import/importParsers';

function row(overrides: Partial<ParsedRow> & { date: number }): ParsedRow {
  return {
    amount: 1,
    description: 'x',
    categoryName: 'Cash Forward',
    type: 'income',
    hashtags: [],
    ...overrides
  };
}

describe('identifyRedundantCarryForwardRows', () => {
  it('excludes every carry-forward row for an account, including the chronologically earliest one (item 72)', () => {
    const rows = [
      row({ date: new Date('2023-01-01').getTime(), account: 'cash' }),
      row({ date: new Date('2022-11-01').getTime(), account: 'cash' }),
      row({ date: new Date('2022-12-01').getTime(), account: 'cash' })
    ];
    const excluded = identifyRedundantCarryForwardRows(rows);
    expect(excluded.size).toBe(3);
    expect(excluded.has(0)).toBe(true);
    expect(excluded.has(1)).toBe(true);
    expect(excluded.has(2)).toBe(true);
  });

  it('treats each account independently, excluding every carry-forward row per account', () => {
    const rows = [
      row({ date: new Date('2022-10-01').getTime(), account: 'cash' }),
      row({ date: new Date('2022-10-01').getTime(), account: 'hdfc-bank' }),
      row({ date: new Date('2022-11-01').getTime(), account: 'cash' }),
      row({ date: new Date('2022-11-01').getTime(), account: 'hdfc-bank' })
    ];
    const excluded = identifyRedundantCarryForwardRows(rows);
    expect(excluded.size).toBe(4);
    expect([0, 1, 2, 3].every((i) => excluded.has(i))).toBe(true);
  });

  it('excludes a carry-forward row even when it is the sole occurrence for its account (item 72 — no earliest-row exception anymore)', () => {
    const rows = [
      row({ date: new Date('2022-10-01').getTime(), account: 'cash' }),
      row({ date: new Date('2022-10-15').getTime(), account: 'hdfc-bank', categoryName: 'Groceries', type: 'expense' })
    ];
    const excluded = identifyRedundantCarryForwardRows(rows);
    expect(excluded.size).toBe(1);
    expect(excluded.has(0)).toBe(true);
    expect(excluded.has(1)).toBe(false);
  });

  it('never flags a row whose category name does not look like a carry-forward marker', () => {
    const rows = [
      row({
        date: new Date('2022-10-01T00:00:00').getTime(),
        amount: 530,
        description: 'Groceries',
        categoryName: 'Groceries',
        type: 'expense',
        account: 'cash'
      })
    ];
    const excluded = identifyRedundantCarryForwardRows(rows);
    expect(excluded.size).toBe(0);
  });

  it('excludes a carry-forward row with no account column at all (grouping key falls back to a shared empty string, but the row is still excluded regardless of grouping)', () => {
    const rows: ParsedRow[] = [
      {
        date: new Date('2022-10-01T00:00:00').getTime(),
        amount: 530,
        description: 'Cash Forward',
        categoryName: 'Cash Forward',
        type: 'income',
        hashtags: []
      }
    ];
    const excluded = identifyRedundantCarryForwardRows(rows);
    expect(excluded.size).toBe(1);
  });
});
