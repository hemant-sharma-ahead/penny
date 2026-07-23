import { describe, expect, it } from 'vitest';
import { computeBalance, projectedBalance, type CandidateTxn } from '@/core/accounts/balanceCalculator';
import type { Expense } from '@/core/db/types';

function txn(p: Partial<Expense>): Expense {
  return {
    id: crypto.randomUUID(),
    amount: 0,
    categoryId: 'c',
    description: '',
    date: 1,
    hashtags: [],
    isRecurring: false,
    createdAt: 1,
    updatedAt: 1,
    ...p
  };
}

const CASH = 'acc-cash';

describe('computeBalance', () => {
  it('applies income (+), expense (−), and transfers (both legs)', () => {
    const txns = [
      txn({ type: 'income', accountId: CASH, amount: 1000 }),
      txn({ type: 'expense', accountId: CASH, amount: 300 }),
      txn({ type: 'transfer', accountId: CASH, toAccountId: 'acc-bank', amount: 200 }),
      txn({ type: 'transfer', accountId: 'acc-bank', toAccountId: CASH, amount: 50 }),
      txn({ type: 'expense', accountId: 'acc-bank', amount: 999 }) // unrelated
    ];
    expect(computeBalance(CASH, 500, txns)).toBe(500 + 1000 - 300 - 200 + 50);
  });
});

describe('projectedBalance (cash-negative guard)', () => {
  const txns = [txn({ type: 'income', accountId: CASH, amount: 1000 })];

  it('projects a candidate expense on top of the current balance', () => {
    const candidate: CandidateTxn = { type: 'expense', accountId: CASH, amount: 1200 };
    expect(projectedBalance(CASH, 0, txns, candidate)).toBe(1000 - 1200); // −200 → would go negative
  });

  it('leaves the balance unchanged for a candidate on another account', () => {
    const candidate: CandidateTxn = { type: 'expense', accountId: 'acc-bank', amount: 5000 };
    expect(projectedBalance(CASH, 0, txns, candidate)).toBe(1000);
  });

  it('adds an incoming transfer leg', () => {
    const candidate: CandidateTxn = { type: 'transfer', accountId: 'acc-bank', toAccountId: CASH, amount: 400 };
    expect(projectedBalance(CASH, 0, txns, candidate)).toBe(1400);
  });
});
