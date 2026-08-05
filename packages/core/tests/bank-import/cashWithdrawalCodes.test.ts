import { describe, expect, it } from 'vitest';
import { BANK_CASH_WITHDRAWAL_CODE_SEEDS, isCashWithdrawalNarration } from '@/core/bank-import/cashWithdrawalCodes';

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
