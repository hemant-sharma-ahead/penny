import { describe, expect, it } from 'vitest';
import { findPossibleDuplicateSms, matchSmsAgainstExpenses } from '@/core/sms-import/smsTransactionMatch';
import type { ParsedSmsCandidate } from '@/core/sms-import/smsParser';
import type { Expense } from '@/core/db/types';
import { DAY_MS } from '@/lib/date';

const BASE_DATE = new Date(2026, 7, 15).getTime();

function expense(overrides: Partial<Expense>): Expense {
  return {
    id: 'exp-1',
    amount: 500,
    categoryId: 'cat-1',
    description: 'Some expense',
    date: BASE_DATE,
    hashtags: [],
    isRecurring: false,
    accountId: 'acc-1',
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  };
}

function candidate(overrides: Partial<ParsedSmsCandidate>): ParsedSmsCandidate {
  return {
    bankId: 'hdfc',
    transactionType: 'debit',
    direction: 'debit',
    amount: 500,
    date: BASE_DATE,
    ...overrides
  };
}

describe('matchSmsAgainstExpenses', () => {
  it('returns none when nothing in the pool is even close', () => {
    const e = expense({ amount: 999 });
    expect(matchSmsAgainstExpenses(candidate({}), 'acc-1', [e])).toEqual({ kind: 'none' });
  });

  it('auto-matches a single same-day, same-amount, same-direction candidate', () => {
    const e = expense({ id: 'exp-only' });
    expect(matchSmsAgainstExpenses(candidate({}), 'acc-1', [e])).toEqual({ kind: 'matched', expenseId: 'exp-only' });
  });

  it('matches within the ±1 day window when not same-day', () => {
    const e = expense({ id: 'exp-nextday', date: BASE_DATE + DAY_MS });
    expect(matchSmsAgainstExpenses(candidate({}), 'acc-1', [e])).toEqual({ kind: 'matched', expenseId: 'exp-nextday' });
  });

  it("does NOT match beyond the ±1 day window (tighter than bank-import's ±3 days)", () => {
    const e = expense({ id: 'exp-far', date: BASE_DATE + 2 * DAY_MS });
    expect(matchSmsAgainstExpenses(candidate({}), 'acc-1', [e])).toEqual({ kind: 'none' });
  });

  it('ignores a wrong-direction expense (income) for a debit SMS', () => {
    const e = expense({ id: 'exp-income', type: 'income' });
    expect(matchSmsAgainstExpenses(candidate({}), 'acc-1', [e])).toEqual({ kind: 'none' });
  });

  it('matches a credit SMS against an income expense', () => {
    const e = expense({ id: 'exp-income', type: 'income' });
    expect(matchSmsAgainstExpenses(candidate({ direction: 'credit' }), 'acc-1', [e])).toEqual({
      kind: 'matched',
      expenseId: 'exp-income'
    });
  });

  it('matches a transfer expense from the source-account side for a debit SMS', () => {
    const e = expense({ id: 'exp-transfer', type: 'transfer', accountId: 'acc-1', toAccountId: 'acc-2' });
    expect(matchSmsAgainstExpenses(candidate({}), 'acc-1', [e])).toEqual({
      kind: 'matched',
      expenseId: 'exp-transfer'
    });
  });

  it('matches a transfer expense from the destination-account side for a credit SMS', () => {
    const e = expense({ id: 'exp-transfer', type: 'transfer', accountId: 'acc-2', toAccountId: 'acc-1' });
    expect(matchSmsAgainstExpenses(candidate({ direction: 'credit' }), 'acc-1', [e])).toEqual({
      kind: 'matched',
      expenseId: 'exp-transfer'
    });
  });

  it('surfaces a tie as "possible" when two same-day/same-amount candidates have no distinguishing description', () => {
    const e1 = expense({ id: 'exp-1', description: 'Groceries' });
    const e2 = expense({ id: 'exp-2', description: 'Rent' });
    const result = matchSmsAgainstExpenses(candidate({ counterparty: 'unrelated text' }), 'acc-1', [e1, e2]);
    expect(result.kind).toBe('possible');
    if (result.kind !== 'possible') return;
    expect(result.expenseIds.sort()).toEqual(['exp-1', 'exp-2']);
  });

  it('breaks a tie using description similarity against the SMS counterparty', () => {
    const e1 = expense({ id: 'exp-grocery', description: 'Big Bazaar Groceries' });
    const e2 = expense({ id: 'exp-rent', description: 'Monthly Rent Payment' });
    const result = matchSmsAgainstExpenses(candidate({ counterparty: 'Big Bazaar' }), 'acc-1', [e1, e2]);
    expect(result).toEqual({ kind: 'matched', expenseId: 'exp-grocery' });
  });

  it('flags a reconciled-date conflict instead of silently auto-linking', () => {
    // Same amount/account/direction, within the ±1 day window, but the matched expense is already
    // bank-reconciled (statementBalance set) and its date disagrees with the SMS's own date.
    const e = expense({ id: 'exp-reconciled', date: BASE_DATE, statementBalance: 12345 });
    const smsCandidate = candidate({ date: BASE_DATE + DAY_MS }); // one day later than the reconciled record
    expect(matchSmsAgainstExpenses(smsCandidate, 'acc-1', [e])).toEqual({
      kind: 'reconciled_conflict',
      expenseId: 'exp-reconciled'
    });
  });

  it('still auto-links a reconciled expense when the dates actually agree', () => {
    const e = expense({ id: 'exp-reconciled', date: BASE_DATE, statementBalance: 12345 });
    expect(matchSmsAgainstExpenses(candidate({ date: BASE_DATE }), 'acc-1', [e])).toEqual({
      kind: 'matched',
      expenseId: 'exp-reconciled'
    });
  });
});

describe('findPossibleDuplicateSms', () => {
  it('finds no duplicates when nothing else is close', () => {
    expect(findPossibleDuplicateSms(candidate({}), 'acc-1', [])).toEqual([]);
  });

  it('flags another parsed SMS with the same account/direction/amount within the window', () => {
    const others = [{ id: 'sms-2', accountId: 'acc-1', date: BASE_DATE, amount: 500, direction: 'debit' as const }];
    expect(findPossibleDuplicateSms(candidate({}), 'acc-1', others)).toEqual(['sms-2']);
  });

  it('ignores a different account, direction, amount, or one outside the window', () => {
    const others = [
      { id: 'sms-diff-acct', accountId: 'acc-2', date: BASE_DATE, amount: 500, direction: 'debit' as const },
      { id: 'sms-diff-dir', accountId: 'acc-1', date: BASE_DATE, amount: 500, direction: 'credit' as const },
      { id: 'sms-diff-amt', accountId: 'acc-1', date: BASE_DATE, amount: 501, direction: 'debit' as const },
      { id: 'sms-far', accountId: 'acc-1', date: BASE_DATE + 2 * DAY_MS, amount: 500, direction: 'debit' as const }
    ];
    expect(findPossibleDuplicateSms(candidate({}), 'acc-1', others)).toEqual([]);
  });
});
