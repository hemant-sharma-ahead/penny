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
  it('keeps only the earliest carry-forward row per account, flagging the rest as redundant', () => {
    const rows = [
      row({ date: new Date('2023-01-01').getTime(), account: 'cash' }),
      row({ date: new Date('2022-11-01').getTime(), account: 'cash' }),
      row({ date: new Date('2022-12-01').getTime(), account: 'cash' })
    ];
    const redundant = identifyRedundantCarryForwardRows(rows);
    // Earliest is index 1 (Nov) — indices 0 (Jan) and 2 (Dec) are redundant.
    expect(redundant.has(1)).toBe(false);
    expect(redundant.has(0)).toBe(true);
    expect(redundant.has(2)).toBe(true);
    expect(redundant.size).toBe(2);
  });

  it('treats each account independently — not a single global "keep only one" cut', () => {
    const rows = [
      row({ date: new Date('2022-10-01').getTime(), account: 'cash' }),
      row({ date: new Date('2022-10-01').getTime(), account: 'hdfc-bank' }),
      row({ date: new Date('2022-11-01').getTime(), account: 'cash' }),
      row({ date: new Date('2022-11-01').getTime(), account: 'hdfc-bank' })
    ];
    const redundant = identifyRedundantCarryForwardRows(rows);
    // Each account's own earliest (index 0 for cash, index 1 for hdfc-bank) survives independently.
    expect(redundant.has(0)).toBe(false);
    expect(redundant.has(1)).toBe(false);
    expect(redundant.has(2)).toBe(true);
    expect(redundant.has(3)).toBe(true);
    expect(redundant.size).toBe(2);
  });

  it('excludes nothing when an account has only a single occurrence', () => {
    const rows = [
      row({ date: new Date('2022-10-01').getTime(), account: 'cash' }),
      row({ date: new Date('2022-10-15').getTime(), account: 'hdfc-bank', categoryName: 'Groceries', type: 'expense' })
    ];
    const redundant = identifyRedundantCarryForwardRows(rows);
    expect(redundant.size).toBe(0);
  });

  it('regression: the real MoneyView sample row (account `cash`, amount 530, "Cash Forward", the file\'s first timestamp) is never flagged when it is the only occurrence', () => {
    const rows: ParsedRow[] = [
      {
        date: new Date('2022-10-01T00:00:00').getTime(),
        amount: 530,
        description: 'Cash Forward',
        categoryName: 'Cash Forward',
        type: 'income',
        account: 'cash',
        hashtags: []
      }
    ];
    const redundant = identifyRedundantCarryForwardRows(rows);
    expect(redundant.size).toBe(0);
  });
});
