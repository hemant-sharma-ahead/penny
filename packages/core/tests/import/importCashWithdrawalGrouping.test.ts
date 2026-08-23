// Item 71 follow-up (2026-08-23, real-device report): a single cash-withdrawal-suspect category can span
// multiple real bank accounts — this used to collapse into one suggestion with a vague "Multiple
// accounts" label; the fix partitions by raw source account BEFORE producing a suggestion. See
// `importCashWithdrawalGrouping.ts`'s own file-header comment for the full write-up.
import { describe, expect, it } from 'vitest';
import {
  groupCashWithdrawalCandidates,
  CASH_WITHDRAWAL_NO_ACCOUNT_KEY,
  type CashWithdrawalGroupInput
} from '@/core/import/importCashWithdrawalGrouping';
import type { ParsedRow } from '@/core/import/importParsers';

function row(overrides: Partial<ParsedRow> & { date: number }): ParsedRow {
  return {
    amount: 5000,
    description: 'ATM WDL',
    categoryName: 'Cash Withdrawal',
    type: 'expense',
    hashtags: [],
    ...overrides
  };
}

describe('groupCashWithdrawalCandidates', () => {
  it('splits a single category group spanning 2+ real source accounts into one candidate PER account, never one aggregate', () => {
    const rows: ParsedRow[] = [
      row({ date: 1, account: 'HDFC Savings' }),
      row({ date: 2, account: 'HDFC Savings' }),
      row({ date: 3, account: 'SBI Salary' })
    ];
    const groups: CashWithdrawalGroupInput[] = [
      {
        fullKey: 'Cash Withdrawal::expense',
        label: 'Cash Withdrawal',
        type: 'expense',
        parentSourceName: 'Cash Withdrawal',
        rowIndices: [0, 1, 2]
      }
    ];
    const candidates = groupCashWithdrawalCandidates(rows, groups, [], new Set());

    expect(candidates).toHaveLength(2);
    const hdfc = candidates.find((c) => c.accountKey === 'HDFC Savings');
    const sbi = candidates.find((c) => c.accountKey === 'SBI Salary');
    expect(hdfc).toMatchObject({ key: 'Cash Withdrawal::expense::HDFC Savings', count: 2, rowIndices: [0, 1] });
    expect(sbi).toMatchObject({ key: 'Cash Withdrawal::expense::SBI Salary', count: 1, rowIndices: [2] });
    // Every candidate's own key is genuinely unique — no accidental collision between the two accounts'
    // suggestions sharing the same underlying category `fullKey`.
    expect(hdfc?.key).not.toBe(sbi?.key);
  });

  it('scales to 3+ real source accounts within one category, one candidate each', () => {
    const rows: ParsedRow[] = [
      row({ date: 1, account: 'HDFC Savings' }),
      row({ date: 2, account: 'SBI Salary' }),
      row({ date: 3, account: 'ICICI Current' })
    ];
    const groups: CashWithdrawalGroupInput[] = [
      {
        fullKey: 'Cash Withdrawal::expense',
        label: 'Cash Withdrawal',
        type: 'expense',
        parentSourceName: 'Cash Withdrawal',
        rowIndices: [0, 1, 2]
      }
    ];
    const candidates = groupCashWithdrawalCandidates(rows, groups, [], new Set());
    expect(candidates).toHaveLength(3);
    expect(new Set(candidates.map((c) => c.accountKey))).toEqual(
      new Set(['HDFC Savings', 'SBI Salary', 'ICICI Current'])
    );
  });

  it('produces just one candidate when every row shares the same real source account (the common single-account case)', () => {
    const rows: ParsedRow[] = [row({ date: 1, account: 'HDFC Savings' }), row({ date: 2, account: 'HDFC Savings' })];
    const groups: CashWithdrawalGroupInput[] = [
      {
        fullKey: 'Cash Withdrawal::expense',
        label: 'Cash Withdrawal',
        type: 'expense',
        parentSourceName: 'Cash Withdrawal',
        rowIndices: [0, 1]
      }
    ];
    const candidates = groupCashWithdrawalCandidates(rows, groups, [], new Set());
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ accountKey: 'HDFC Savings', count: 2 });
  });

  it('groups rows with no CSV account value at all under the CASH_WITHDRAWAL_NO_ACCOUNT_KEY sentinel, never mixed with a real account', () => {
    const rows: ParsedRow[] = [row({ date: 1, account: 'HDFC Savings' }), row({ date: 2 })];
    const groups: CashWithdrawalGroupInput[] = [
      {
        fullKey: 'Cash Withdrawal::expense',
        label: 'Cash Withdrawal',
        type: 'expense',
        parentSourceName: 'Cash Withdrawal',
        rowIndices: [0, 1]
      }
    ];
    const candidates = groupCashWithdrawalCandidates(rows, groups, [], new Set());
    expect(candidates).toHaveLength(2);
    expect(candidates.find((c) => c.accountKey === CASH_WITHDRAWAL_NO_ACCOUNT_KEY)).toMatchObject({ rowIndices: [1] });
  });

  it('excludes rows already claimed by a confirmed transfer pair before partitioning', () => {
    const rows: ParsedRow[] = [
      row({ date: 1, account: 'HDFC Savings' }),
      row({ date: 2, account: 'HDFC Savings' }),
      row({ date: 3, account: 'SBI Salary' })
    ];
    const groups: CashWithdrawalGroupInput[] = [
      {
        fullKey: 'Cash Withdrawal::expense',
        label: 'Cash Withdrawal',
        type: 'expense',
        parentSourceName: 'Cash Withdrawal',
        rowIndices: [0, 1, 2]
      }
    ];
    const candidates = groupCashWithdrawalCandidates(
      rows,
      groups,
      [{ outgoingIndex: 0, incomingIndex: 99 }],
      new Set()
    );
    expect(candidates).toHaveLength(2);
    expect(candidates.find((c) => c.accountKey === 'HDFC Savings')?.rowIndices).toEqual([1]);
    expect(candidates.find((c) => c.accountKey === 'SBI Salary')?.rowIndices).toEqual([2]);
  });

  it('omits a candidate whose group becomes empty once its only row is paired away', () => {
    const rows: ParsedRow[] = [row({ date: 1, account: 'HDFC Savings' })];
    const groups: CashWithdrawalGroupInput[] = [
      {
        fullKey: 'Cash Withdrawal::expense',
        label: 'Cash Withdrawal',
        type: 'expense',
        parentSourceName: 'Cash Withdrawal',
        rowIndices: [0]
      }
    ];
    const candidates = groupCashWithdrawalCandidates(rows, groups, [{ outgoingIndex: 0, incomingIndex: 1 }], new Set());
    expect(candidates).toEqual([]);
  });

  it('omits exactly the dismissed (category, account) candidate, leaving a sibling account under the same category unaffected', () => {
    const rows: ParsedRow[] = [row({ date: 1, account: 'HDFC Savings' }), row({ date: 2, account: 'SBI Salary' })];
    const groups: CashWithdrawalGroupInput[] = [
      {
        fullKey: 'Cash Withdrawal::expense',
        label: 'Cash Withdrawal',
        type: 'expense',
        parentSourceName: 'Cash Withdrawal',
        rowIndices: [0, 1]
      }
    ];
    const dismissed = new Set(['Cash Withdrawal::expense::HDFC Savings']);
    const candidates = groupCashWithdrawalCandidates(rows, groups, [], dismissed);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ accountKey: 'SBI Salary' });
  });

  it('ignores a non-cash-withdrawal category entirely, regardless of how many accounts its rows span', () => {
    const rows: ParsedRow[] = [
      row({ date: 1, account: 'HDFC Savings', categoryName: 'Groceries' }),
      row({ date: 2, account: 'SBI Salary', categoryName: 'Groceries' })
    ];
    const groups: CashWithdrawalGroupInput[] = [
      {
        fullKey: 'Groceries::expense',
        label: 'Groceries',
        type: 'expense',
        parentSourceName: 'Groceries',
        rowIndices: [0, 1]
      }
    ];
    expect(groupCashWithdrawalCandidates(rows, groups, [], new Set())).toEqual([]);
  });

  it('ignores an income-direction group even if its category name looks like a cash withdrawal', () => {
    const rows: ParsedRow[] = [row({ date: 1, account: 'HDFC Savings', type: 'income' })];
    const groups: CashWithdrawalGroupInput[] = [
      {
        fullKey: 'Cash Withdrawal::income',
        label: 'Cash Withdrawal',
        type: 'income',
        parentSourceName: 'Cash Withdrawal',
        rowIndices: [0]
      }
    ];
    expect(groupCashWithdrawalCandidates(rows, groups, [], new Set())).toEqual([]);
  });
});
