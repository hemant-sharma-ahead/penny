import { describe, expect, it } from 'vitest';
import { normalizeNarration, prettifyMerchantKey, UNKNOWN_MERCHANT_KEY } from '@/core/bank-import/normalization';
import type { BankNarrationOverride } from '@/core/db/types';

describe('normalizeNarration', () => {
  it('drops connector keywords and purely-numeric reference tokens, keeping the rest', () => {
    // "YBL" (a bank/IFSC fragment) isn't stripped by the fixed heuristic — exactly the kind of
    // long-tail case the manual override screen (not the heuristic itself) is meant to fix.
    expect(normalizeNarration('UPI-SWIGGY-411223344-YBL')).toBe('SWIGGY YBL');
  });

  it('joins multiple remaining alphabetic tokens', () => {
    expect(normalizeNarration('NEFT CR-ACME CORP-REF123')).toBe('ACME CORP');
  });

  it('falls back to UNKNOWN when nothing alphabetic survives', () => {
    expect(normalizeNarration('123456789')).toBe(UNKNOWN_MERCHANT_KEY);
  });

  it('a manual override always wins over the heuristic', () => {
    const overrides: BankNarrationOverride[] = [
      { id: '1', keyword: 'XYZ', normalizedKey: 'CHAI SNACKS', createdAt: 0, updatedAt: 0 }
    ];
    expect(normalizeNarration('POS-XYZ-998877', overrides)).toBe('CHAI SNACKS');
  });

  it('override match is case-insensitive', () => {
    const overrides: BankNarrationOverride[] = [
      { id: '1', keyword: 'zomato', normalizedKey: 'FOOD DELIVERY', createdAt: 0, updatedAt: 0 }
    ];
    expect(normalizeNarration('UPI-ZOMATO-123', overrides)).toBe('FOOD DELIVERY');
  });

  // Found by running real sample statements (7 banks) through this heuristic on 2026-08-03 —
  // ACH/INW/REV were all leaking into the key as noise before being added to CONNECTOR_KEYWORDS.
  it('drops ACH (a rail keyword, same treatment as NEFT/IMPS/RTGS)', () => {
    expect(normalizeNarration('ACH CR/DIVIDEND INCOME/TCS LTD')).toBe('DIVIDEND INCOME TCS LTD');
  });

  it('drops INW (IMPS inward-transfer indicator)', () => {
    expect(normalizeNarration('IMPS INW/452311/GPAY REWARD CASHBACK')).toBe('GPAY REWARD CASHBACK');
  });

  it('drops REV (a reversal indicator)', () => {
    expect(normalizeNarration('UPI/REV/622112/IRCTC TRAIN REFUND')).toBe('IRCTC TRAIN REFUND');
  });

  it('keeps SENT/RECEIVED (deliberately not stripped — the Lent/Borrowed panel relies on the direction split)', () => {
    expect(normalizeNarration('UPI/610322/SENT TO AMIT SHARMA')).toBe('SENT AMIT SHARMA');
    expect(normalizeNarration('UPI/601504/RECEIVED FROM AMIT SHARMA')).toBe('RECEIVED AMIT SHARMA');
  });
});

describe('prettifyMerchantKey', () => {
  it('title-cases longer tokens but keeps short ones (likely acronyms) upper-case', () => {
    expect(prettifyMerchantKey('ACH DIVIDEND INCOME TCS LTD')).toBe('ACH Dividend Income TCS LTD');
  });

  it('title-cases a single long token', () => {
    expect(prettifyMerchantKey('SWIGGY')).toBe('Swiggy');
  });

  it('leaves the UNKNOWN fallback readable', () => {
    expect(prettifyMerchantKey(UNKNOWN_MERCHANT_KEY)).toBe('Unknown');
  });
});
