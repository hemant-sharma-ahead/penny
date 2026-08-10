import { describe, expect, it } from 'vitest';
import {
  applyCashTransferConversion,
  BANK_CASH_WITHDRAWAL_CODE_SEEDS,
  isCashWithdrawalNarration,
  suggestCashTransfer,
  suggestRetroactiveCashTransfer
} from '@/core/bank-import/cashWithdrawalCodes';
import type { Expense } from '@/core/db/types';

describe('isCashWithdrawalNarration', () => {
  const codes = BANK_CASH_WITHDRAWAL_CODE_SEEDS;

  it('matches a bank-specific code for that bank', () => {
    expect(isCashWithdrawalNarration('ATW-401234-BRANCH', 'hdfc', codes)).toBe(true);
    expect(isCashWithdrawalNarration('NWD/OTHERBANKATM/123', 'hdfc', codes)).toBe(true);
  });

  it('does not match a code belonging to a different bank only', () => {
    // ATL is Kotak's other-bank-ATM code — HDFC doesn't use it, and it's not in the bank-agnostic list.
    expect(isCashWithdrawalNarration('ATL-999-XYZ', 'hdfc', codes)).toBe(false);
  });

  it('matches bank-agnostic codes regardless of the active bank', () => {
    expect(isCashWithdrawalNarration('NFS/CASH WDL/12345', 'bob', codes)).toBe(true);
    expect(isCashWithdrawalNarration('SELF WITHDRAWAL BRANCH', 'indusind', codes)).toBe(true);
  });

  it('matches the multi-word "ATM WDL" code as a phrase', () => {
    expect(isCashWithdrawalNarration('ATM WDL KORAMANGALA 210525', 'icici', codes)).toBe(true);
  });

  it('does not false-positive on a merchant name that merely contains the code as a substring', () => {
    // "SELF" must not match inside "SELFRIDGES" — word-boundary match, not a plain substring test.
    expect(isCashWithdrawalNarration('SELFRIDGES ONLINE STORE', 'hdfc', codes)).toBe(false);
  });

  it('returns false when nothing matches', () => {
    expect(isCashWithdrawalNarration('SWIGGY ORDER 12345', 'hdfc', codes)).toBe(false);
  });

  it('matches a multi-word code regardless of the actual separator used (2026-08-05 fix)', () => {
    // "ATM WDL" is stored space-separated, but real statements print all kinds of separators.
    expect(isCashWithdrawalNarration('ATM/WDL/BRANCH/123', 'kotak', codes)).toBe(true);
    expect(isCashWithdrawalNarration('ATM-WDL-123456', 'kotak', codes)).toBe(true);
    expect(isCashWithdrawalNarration('ATMWDL123456', 'kotak', codes)).toBe(true);
    expect(isCashWithdrawalNarration('ATM WDL 123456', 'kotak', codes)).toBe(true);
  });

  it('does not classify an ATM transaction reversal as a withdrawal', () => {
    // A failed ATM withdrawal being credited back — contains the bare "ATM" code, but "REV" excludes it.
    expect(isCashWithdrawalNarration('ATM REV 401234', 'sbi', codes)).toBe(false);
  });

  it('does not classify a non-maintenance-balance fee mentioning ATM as a withdrawal', () => {
    expect(isCashWithdrawalNarration('AMB CHARGES ATM NON MAINTENANCE', 'sbi', codes)).toBe(false);
  });

  it('does not classify a POS purchase as a withdrawal', () => {
    expect(isCashWithdrawalNarration('POS PURCHASE BIG BAZAAR', 'hdfc', codes)).toBe(false);
  });

  it('recognizes the new per-bank codes from the 2026-08-05 research pass', () => {
    expect(isCashWithdrawalNarration('MAT-999-OTHERBANK', 'icici', codes)).toBe(true);
    expect(isCashWithdrawalNarration('VAT WDL 12345', 'icici', codes)).toBe(true);
    expect(isCashWithdrawalNarration('ATS-401234', 'sbi', codes)).toBe(true);
    expect(isCashWithdrawalNarration('NFS_WDL/123456', 'bob', codes)).toBe(true);
    expect(isCashWithdrawalNarration('CASH DEBIT BRANCH', 'bob', codes)).toBe(true);
    expect(isCashWithdrawalNarration('BRANCH CASH WITHDRAWAL', 'hsbc', codes)).toBe(true);
  });
});

// docs/plans/bank-balance-sync.md §3 decision #2, §17 Finding 1, §7 Stage 7 — the retroactive
// cash-withdrawal-to-transfer prompt for a statement row that MATCHED an already-existing plain
// expense, rather than building a brand-new one.
describe('suggestRetroactiveCashTransfer (docs/plans/bank-balance-sync.md §17 Finding 1)', () => {
  const codes = BANK_CASH_WITHDRAWAL_CODE_SEEDS;
  const CASH_ACCOUNT = { id: 'acc-cash' };

  function matchedExpense(overrides: Partial<Expense> = {}): Expense {
    return {
      id: 'e-cashew-1',
      amount: 5000,
      categoryId: 'cat-misc',
      description: 'Cash withdrawal',
      date: Date.UTC(2026, 3, 5),
      hashtags: [],
      isRecurring: false,
      type: 'expense',
      accountId: 'acc-hdfc',
      createdAt: 0,
      updatedAt: 0,
      ...overrides
    };
  }

  it('the exact §17 Finding 1 scenario: fires for a matched plain expense whose statement row carries a cash-withdrawal code', () => {
    // 05-Apr "ATW HDFC ATM" −5,000, matched against Cashew's already-existing "Cash withdrawal" plain
    // expense — exactly the simulation's own worked example (also recurs 08-May, same shape).
    const suggestion = suggestRetroactiveCashTransfer(matchedExpense(), 'ATW-401234-BRANCH', 'hdfc', codes, [
      CASH_ACCOUNT
    ]);
    expect(suggestion).toEqual({ suggestedType: 'transfer', toAccountId: CASH_ACCOUNT.id });
  });

  it('accepting the suggestion converts the existing expense to type transfer with the correct toAccountId', () => {
    const original = matchedExpense();
    const suggestion = suggestRetroactiveCashTransfer(original, 'ATW-401234-BRANCH', 'hdfc', codes, [CASH_ACCOUNT]);
    expect(suggestion?.toAccountId).toBe(CASH_ACCOUNT.id);
    const converted = applyCashTransferConversion(original, suggestion?.toAccountId ?? '', 12345);
    expect(converted).toEqual({ ...original, type: 'transfer', toAccountId: CASH_ACCOUNT.id, updatedAt: 12345 });
    // Nothing else about the expense (description, category, amount, date) is touched — this is a
    // targeted reclassification, not a rewrite.
    expect(converted.description).toBe(original.description);
    expect(converted.categoryId).toBe(original.categoryId);
    expect(converted.amount).toBe(original.amount);
    expect(converted.date).toBe(original.date);
  });

  it('regression: a matched row whose narration does NOT carry a cash-withdrawal code never suggests anything', () => {
    const suggestion = suggestRetroactiveCashTransfer(
      matchedExpense({ description: 'Swiggy dinner' }),
      'UPI-SWIGGY-123',
      'hdfc',
      codes,
      [CASH_ACCOUNT]
    );
    expect(suggestion).toBeNull();
  });

  it('a matched row already resolved to an existing type: transfer expense never re-suggests — nothing to convert', () => {
    const suggestion = suggestRetroactiveCashTransfer(
      matchedExpense({ type: 'transfer', toAccountId: 'acc-somewhere-else' }),
      'ATW-401234-BRANCH',
      'hdfc',
      codes,
      [CASH_ACCOUNT]
    );
    expect(suggestion).toBeNull();
  });

  it('still fires (with an unresolved toAccountId) when 2+ cash accounts exist, leaving the choice to the caller', () => {
    const suggestion = suggestRetroactiveCashTransfer(matchedExpense(), 'ATW-401234-BRANCH', 'hdfc', codes, [
      CASH_ACCOUNT,
      { id: 'acc-cash-2' }
    ]);
    expect(suggestion).toEqual({ suggestedType: 'transfer' });
  });

  it('regression: the existing unmatched/new-row suggestCashTransfer path is unchanged by this addition', () => {
    // Same narration/bank/codes/cash-accounts as the retroactive case above — the underlying detection
    // is identical (suggestRetroactiveCashTransfer delegates straight to this), just without any
    // matched-expense context (and its type-transfer guard) to consider.
    expect(suggestCashTransfer('ATW-401234-BRANCH', 'hdfc', codes, [CASH_ACCOUNT])).toEqual({
      suggestedType: 'transfer',
      toAccountId: CASH_ACCOUNT.id
    });
    expect(suggestCashTransfer('UPI-SWIGGY-123', 'hdfc', codes, [CASH_ACCOUNT])).toBeNull();
  });
});
