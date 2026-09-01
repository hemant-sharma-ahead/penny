import { describe, expect, it } from 'vitest';
import {
  applyCashTransferConversion,
  BANK_CASH_WITHDRAWAL_CODE_SEEDS,
  cashDirectionForRow,
  isCashTransferNarration,
  suggestCashTransfer,
  suggestRetroactiveCashTransfer
} from '@/core/bank-import/cashWithdrawalCodes';
import type { Expense } from '@/core/db/types';

describe('isCashTransferNarration', () => {
  const codes = BANK_CASH_WITHDRAWAL_CODE_SEEDS;

  it('matches a bank-specific code for that bank', () => {
    expect(isCashTransferNarration('ATW-401234-BRANCH', 'hdfc', 'withdrawal', codes)).toBe(true);
    expect(isCashTransferNarration('NWD/OTHERBANKATM/123', 'hdfc', 'withdrawal', codes)).toBe(true);
  });

  it('does not match a code belonging to a different bank only', () => {
    // ATL is Kotak's other-bank-ATM code — HDFC doesn't use it, and it's not in the bank-agnostic list.
    expect(isCashTransferNarration('ATL-999-XYZ', 'hdfc', 'withdrawal', codes)).toBe(false);
  });

  it('matches bank-agnostic codes regardless of the active bank', () => {
    expect(isCashTransferNarration('NFS/CASH WDL/12345', 'bob', 'withdrawal', codes)).toBe(true);
    expect(isCashTransferNarration('SELF WITHDRAWAL BRANCH', 'indusind', 'withdrawal', codes)).toBe(true);
  });

  it('matches the multi-word "ATM WDL" code as a phrase', () => {
    expect(isCashTransferNarration('ATM WDL KORAMANGALA 210525', 'icici', 'withdrawal', codes)).toBe(true);
  });

  it('does not false-positive on a merchant name that merely contains the code as a substring', () => {
    // "SELF" must not match inside "SELFRIDGES" — word-boundary match, not a plain substring test.
    expect(isCashTransferNarration('SELFRIDGES ONLINE STORE', 'hdfc', 'withdrawal', codes)).toBe(false);
  });

  it('returns false when nothing matches', () => {
    expect(isCashTransferNarration('SWIGGY ORDER 12345', 'hdfc', 'withdrawal', codes)).toBe(false);
  });

  it('matches a multi-word code regardless of the actual separator used (2026-08-05 fix)', () => {
    // "ATM WDL" is stored space-separated, but real statements print all kinds of separators.
    expect(isCashTransferNarration('ATM/WDL/BRANCH/123', 'kotak', 'withdrawal', codes)).toBe(true);
    expect(isCashTransferNarration('ATM-WDL-123456', 'kotak', 'withdrawal', codes)).toBe(true);
    expect(isCashTransferNarration('ATMWDL123456', 'kotak', 'withdrawal', codes)).toBe(true);
    expect(isCashTransferNarration('ATM WDL 123456', 'kotak', 'withdrawal', codes)).toBe(true);
  });

  it('does not classify an ATM transaction reversal as a withdrawal', () => {
    // A failed ATM withdrawal being credited back — contains the bare "ATM" code, but "REV" excludes it.
    expect(isCashTransferNarration('ATM REV 401234', 'sbi', 'withdrawal', codes)).toBe(false);
  });

  it('does not classify a non-maintenance-balance fee mentioning ATM as a withdrawal', () => {
    expect(isCashTransferNarration('AMB CHARGES ATM NON MAINTENANCE', 'sbi', 'withdrawal', codes)).toBe(false);
  });

  it('does not classify a POS purchase as a withdrawal', () => {
    expect(isCashTransferNarration('POS PURCHASE BIG BAZAAR', 'hdfc', 'withdrawal', codes)).toBe(false);
  });

  it('recognizes the new per-bank codes from the 2026-08-05 research pass', () => {
    expect(isCashTransferNarration('MAT-999-OTHERBANK', 'icici', 'withdrawal', codes)).toBe(true);
    expect(isCashTransferNarration('VAT WDL 12345', 'icici', 'withdrawal', codes)).toBe(true);
    expect(isCashTransferNarration('ATS-401234', 'sbi', 'withdrawal', codes)).toBe(true);
    expect(isCashTransferNarration('NFS_WDL/123456', 'bob', 'withdrawal', codes)).toBe(true);
    expect(isCashTransferNarration('CASH DEBIT BRANCH', 'bob', 'withdrawal', codes)).toBe(true);
    expect(isCashTransferNarration('BRANCH CASH WITHDRAWAL', 'hsbc', 'withdrawal', codes)).toBe(true);
  });

  // 2026-08-27 — the reverse direction: cash moving INTO the bank account.
  describe('deposit direction', () => {
    it('matches a deposit code only when asked for the deposit direction', () => {
      expect(isCashTransferNarration('CDM DEPOSIT 401234', 'hdfc', 'deposit', codes)).toBe(true);
      expect(isCashTransferNarration('CASH DEP BRANCH', 'sbi', 'deposit', codes)).toBe(true);
    });

    it('a withdrawal code never matches when asked for the deposit direction, and vice versa', () => {
      // "ATW" is withdrawal-only — must not match as a deposit even though the narration text alone
      // would otherwise satisfy `buildCodePattern`.
      expect(isCashTransferNarration('ATW-401234-BRANCH', 'hdfc', 'deposit', codes)).toBe(false);
      // "CDM" is deposit-only — must not match as a withdrawal.
      expect(isCashTransferNarration('CDM DEPOSIT 401234', 'hdfc', 'withdrawal', codes)).toBe(false);
    });

    it('a legacy code with no stored `direction` is treated as withdrawal-only', () => {
      const legacyCodes = [{ bankId: 'any', code: 'XYZ' }]; // no `direction` field at all
      expect(isCashTransferNarration('XYZ REF 123', 'hdfc', 'withdrawal', legacyCodes)).toBe(true);
      expect(isCashTransferNarration('XYZ REF 123', 'hdfc', 'deposit', legacyCodes)).toBe(false);
    });
  });
});

describe('cashDirectionForRow', () => {
  it('maps a debit row to withdrawal and a credit row to deposit', () => {
    expect(cashDirectionForRow({ direction: 'debit' })).toBe('withdrawal');
    expect(cashDirectionForRow({ direction: 'credit' })).toBe('deposit');
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
    expect(suggestion).toEqual({ suggestedType: 'transfer', direction: 'withdrawal', toAccountId: CASH_ACCOUNT.id });
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
    expect(suggestion).toEqual({ suggestedType: 'transfer', direction: 'withdrawal' });
  });

  it('regression: the existing unmatched/new-row suggestCashTransfer path is unchanged by this addition', () => {
    // Same narration/bank/codes/cash-accounts as the retroactive case above — the underlying detection
    // is identical (suggestRetroactiveCashTransfer delegates straight to this), just without any
    // matched-expense context (and its type-transfer guard) to consider.
    expect(suggestCashTransfer('ATW-401234-BRANCH', 'hdfc', 'withdrawal', codes, [CASH_ACCOUNT])).toEqual({
      suggestedType: 'transfer',
      direction: 'withdrawal',
      toAccountId: CASH_ACCOUNT.id
    });
    expect(suggestCashTransfer('UPI-SWIGGY-123', 'hdfc', 'withdrawal', codes, [CASH_ACCOUNT])).toBeNull();
  });

  // 2026-08-27 — the deposit-direction sibling: a matched `income` expense whose statement row carries
  // a deposit code (money already arrived at the bank; cash was the real source).
  describe('deposit direction', () => {
    function matchedIncome(overrides: Partial<Expense> = {}): Expense {
      return matchedExpense({ type: 'income', description: 'Cash deposit', ...overrides });
    }

    it("derives deposit direction from the matched expense's own income type", () => {
      const suggestion = suggestRetroactiveCashTransfer(matchedIncome(), 'CDM DEPOSIT 401234', 'hdfc', codes, [
        CASH_ACCOUNT
      ]);
      expect(suggestion).toEqual({ suggestedType: 'transfer', direction: 'deposit', toAccountId: CASH_ACCOUNT.id });
    });

    it('converting a deposit suggestion puts the cash account as SOURCE, the bank account as DESTINATION', () => {
      // Found + fixed 2026-08-27: this used to always leave `accountId` untouched (the bank account)
      // and set `toAccountId` to cash — correct for a withdrawal, backwards for a deposit.
      const original = matchedIncome();
      const converted = applyCashTransferConversion(original, CASH_ACCOUNT.id, 12345);
      expect(converted.type).toBe('transfer');
      expect(converted.accountId).toBe(CASH_ACCOUNT.id);
      expect(converted.toAccountId).toBe(original.accountId);
      // Still untouched otherwise.
      expect(converted.description).toBe(original.description);
      expect(converted.amount).toBe(original.amount);
    });

    it('a withdrawal-only code never fires for a matched income (deposit-direction) row', () => {
      const suggestion = suggestRetroactiveCashTransfer(matchedIncome(), 'ATW-401234-BRANCH', 'hdfc', codes, [
        CASH_ACCOUNT
      ]);
      expect(suggestion).toBeNull();
    });

    it('a deposit-only code never fires for a matched expense (withdrawal-direction) row', () => {
      const suggestion = suggestRetroactiveCashTransfer(matchedExpense(), 'CDM DEPOSIT 401234', 'hdfc', codes, [
        CASH_ACCOUNT
      ]);
      expect(suggestion).toBeNull();
    });
  });
});
