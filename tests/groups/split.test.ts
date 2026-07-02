import { describe, expect, it } from 'vitest';
import {
  computeShares,
  equalSplit,
  foldGroupBalances,
  whoOwesWhom,
  type FoldEvent
} from '@/core/groups/split';

const sum = (r: Record<string, number>) => Object.values(r).reduce((s, v) => s + v, 0);

describe('computeShares', () => {
  it('splits equally and reconciles to the total', () => {
    const r = computeShares({ total: 4800, method: 'equal', participants: ['a', 'b', 'c', 'd'] });
    expect(r.valid).toBe(true);
    expect(r.shares).toEqual({ a: 1200, b: 1200, c: 1200, d: 1200 });
    expect(sum(r.shares)).toBe(4800);
  });

  it('distributes an indivisible remainder to the paisa (100/3)', () => {
    const r = computeShares({ total: 100, method: 'equal', participants: ['a', 'b', 'c'] });
    expect(sum(r.shares)).toBeCloseTo(100, 5);
    // 33.34 + 33.33 + 33.33
    expect(r.shares.a).toBeCloseTo(33.34, 2);
    expect(r.shares.b).toBeCloseTo(33.33, 2);
  });

  it('validates unequal (exact) splits against the total', () => {
    const ok = computeShares({ total: 1000, method: 'unequal', participants: ['a', 'b'], values: { a: 700, b: 300 } });
    expect(ok.valid).toBe(true);
    const bad = computeShares({ total: 1000, method: 'unequal', participants: ['a', 'b'], values: { a: 700, b: 200 } });
    expect(bad.valid).toBe(false);
  });

  it('splits by percent and flags when percentages do not sum to 100', () => {
    const ok = computeShares({ total: 2000, method: 'percent', participants: ['a', 'b'], values: { a: 25, b: 75 } });
    expect(ok.valid).toBe(true);
    expect(ok.shares).toEqual({ a: 500, b: 1500 });
    const bad = computeShares({ total: 2000, method: 'percent', participants: ['a', 'b'], values: { a: 25, b: 70 } });
    expect(bad.valid).toBe(false);
    expect(sum(bad.shares)).toBeCloseTo(2000, 5); // still reconciles the money
  });

  it('splits by shares proportionally', () => {
    const r = computeShares({ total: 900, method: 'shares', participants: ['a', 'b', 'c'], values: { a: 2, b: 1, c: 0 } });
    expect(r.valid).toBe(true);
    expect(r.shares).toEqual({ a: 600, b: 300, c: 0 });
  });

  it('rejects empty participants / non-positive totals', () => {
    expect(computeShares({ total: 100, method: 'equal', participants: [] }).valid).toBe(false);
    expect(computeShares({ total: 0, method: 'equal', participants: ['a'] }).valid).toBe(false);
  });

  it('equalSplit convenience matches computeShares', () => {
    expect(equalSplit(300, ['a', 'b', 'c'])).toEqual({ a: 100, b: 100, c: 100 });
  });
});

describe('foldGroupBalances', () => {
  it('credits the payer and debits participants for a shared expense', () => {
    const events: FoldEvent[] = [
      { type: 'shared_expense', payload: { expenseId: 'e1', amount: 1200, payer: 'a', shares: { a: 400, b: 400, c: 400 } } }
    ];
    const bal = foldGroupBalances(events);
    expect(bal.a).toBeCloseTo(800, 5); // paid 1200, owed 400
    expect(bal.b).toBeCloseTo(-400, 5);
    expect(bal.c).toBeCloseTo(-400, 5);
    expect(sum(bal)).toBeCloseTo(0, 5);
  });

  it('applies edits (supersede) and deletes (tombstone)', () => {
    const events: FoldEvent[] = [
      { type: 'shared_expense', payload: { expenseId: 'e1', amount: 1000, payer: 'a', shares: { a: 500, b: 500 } } },
      { type: 'expense_edit', payload: { expenseId: 'e1', amount: 2000, payer: 'a', shares: { a: 1000, b: 1000 } } },
      { type: 'shared_expense', payload: { expenseId: 'e2', amount: 600, payer: 'b', shares: { a: 300, b: 300 } } },
      { type: 'expense_delete', expenseId: 'e2' }
    ];
    const bal = foldGroupBalances(events);
    expect(bal.a).toBeCloseTo(1000, 5); // only edited e1 counts: paid 2000, owed 1000
    expect(bal.b).toBeCloseTo(-1000, 5);
  });

  it('applies settlements', () => {
    const events: FoldEvent[] = [
      { type: 'shared_expense', payload: { expenseId: 'e1', amount: 1000, payer: 'a', shares: { a: 500, b: 500 } } },
      { type: 'settlement', payload: { from: 'b', to: 'a', amount: 500 } }
    ];
    const bal = foldGroupBalances(events);
    expect(bal.a).toBeCloseTo(0, 5);
    expect(bal.b).toBeCloseTo(0, 5);
  });
});

describe('whoOwesWhom', () => {
  it('produces transfers that clear every balance', () => {
    const balances = { a: 800, b: -400, c: -400 };
    const transfers = whoOwesWhom(balances);
    // Apply the transfers and confirm everyone nets to zero.
    const net = { ...balances };
    for (const t of transfers) {
      net[t.from] += t.amount;
      net[t.to] -= t.amount;
    }
    for (const v of Object.values(net)) expect(v).toBeCloseTo(0, 5);
    expect(transfers.every((t) => t.amount > 0)).toBe(true);
  });

  it('returns nothing when everyone is settled', () => {
    expect(whoOwesWhom({ a: 0, b: 0 })).toEqual([]);
  });

  it('keeps the transfer set compact (greedy)', () => {
    // a is owed 900; b/c/d each owe 300 → 3 transfers, not more.
    const transfers = whoOwesWhom({ a: 900, b: -300, c: -300, d: -300 });
    expect(transfers).toHaveLength(3);
    expect(transfers.every((t) => t.to === 'a')).toBe(true);
  });
});
