import { describe, expect, it } from 'vitest';
import { groupUnmatchedByMerchant } from '@/core/bank-import/grouping';
import type { ParsedStatementRow } from '@/core/bank-import/types';

function row(rawNarration: string, rowIndex: number): ParsedStatementRow {
  return { rawNarration, date: 0, amount: 100, direction: 'debit', rowIndex };
}

describe('groupUnmatchedByMerchant', () => {
  it('groups repeat merchants under one normalized key', () => {
    const rows = [row('UPI-ZOMATO-1', 1), row('UPI-SWIGGY-2', 2), row('UPI-ZOMATO-3', 3), row('UPI-ZOMATO-4', 4)];
    const groups = groupUnmatchedByMerchant(rows);
    const zomato = groups.find((g) => g.normalizedKey === 'ZOMATO');
    expect(zomato?.rows).toHaveLength(3);
  });

  it('sorts largest group first', () => {
    const rows = [row('UPI-SWIGGY-1', 1), row('UPI-ZOMATO-2', 2), row('UPI-ZOMATO-3', 3)];
    const groups = groupUnmatchedByMerchant(rows);
    expect(groups[0]?.normalizedKey).toBe('ZOMATO');
  });
});
