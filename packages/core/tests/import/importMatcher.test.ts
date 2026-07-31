import { describe, expect, it } from 'vitest';
import { guessColumnMapping, resolveAmount, parseFlexibleDate } from '@/core/import/importMatcher';

describe('guessColumnMapping', () => {
  it('prefers an exact header match over a substring match at an earlier column', () => {
    // Real Cashew export shape: "amount" (exact) appears after "amount unpaid" would if column order
    // were reversed — verifies the two-pass exact-then-substring resolution, not naive left-to-right scan.
    const header = ['amount unpaid', 'amount', 'currency'];
    const mapping = guessColumnMapping(header, { amount: ['amount'] });
    expect(mapping.amount).toBe(1);
  });

  it('prefers a more specific synonym over a more generic one when both exist (real MoneyView shape)', () => {
    const header = ['Bank Name', 'Account Id', 'Account Type'];
    const mapping = guessColumnMapping(header, { account: ['account id', 'bank name'] });
    expect(mapping.account).toBe(1); // "Account Id" wins even though "Bank Name" comes first in the header
  });

  it('falls back to substring match when no synonym matches exactly', () => {
    const header = ['Merchant/Receiver/Sender'];
    const mapping = guessColumnMapping(header, { description: ['merchant/receiver/sender', 'narration'] });
    expect(mapping.description).toBe(0);
  });

  it('returns -1 for a field with no matching column at all', () => {
    const mapping = guessColumnMapping(['date', 'amount'], { tags: ['tags', 'labels'] });
    expect(mapping.tags).toBe(-1);
  });
});

describe('resolveAmount', () => {
  const base = {
    date: 0,
    description: 1,
    category: -1,
    account: -1,
    notes: -1,
    tags: -1,
    paymentMode: -1,
    typeText: -1,
    amount: -1,
    outflow: -1,
    inflow: -1,
    incomeFlag: -1
  };

  it('resolves a split debit/credit pair (real MoneyView shape) — debit wins as expense', () => {
    const mapping = { ...base, outflow: 2, inflow: 3 };
    expect(resolveAmount(['d', 'x', '150', '0'], mapping)).toEqual({ amount: 150, type: 'expense' });
  });

  it('resolves a split pair where credit is populated instead — income', () => {
    const mapping = { ...base, outflow: 2, inflow: 3 };
    expect(resolveAmount(['d', 'x', '0', '5000'], mapping)).toEqual({ amount: 5000, type: 'income' });
  });

  it('resolves a single signed amount column (negative = expense)', () => {
    const mapping = { ...base, amount: 2 };
    expect(resolveAmount(['d', 'x', '-240.0'], mapping)).toEqual({ amount: 240, type: 'expense' });
  });

  it('resolves a single amount column with an explicit income flag (Cashew shape)', () => {
    const mapping = { ...base, amount: 2, incomeFlag: 3 };
    expect(resolveAmount(['d', 'x', '140000', 'TRUE'], mapping)).toEqual({ amount: 140000, type: 'income' });
    expect(resolveAmount(['d', 'x', '-240', 'FALSE'], mapping)).toEqual({ amount: 240, type: 'expense' });
  });

  it('returns null when no amount pattern is present or the amount is zero', () => {
    expect(resolveAmount(['d', 'x'], base)).toBeNull();
    expect(resolveAmount(['d', 'x', '0'], { ...base, amount: 2 })).toBeNull();
  });
});

describe('parseFlexibleDate', () => {
  it('parses DD/MM/YYYY with the DMY hint', () => {
    expect(parseFlexibleDate('14/06/2026', 'DMY')).toBe(new Date(2026, 5, 14).getTime());
  });

  it('parses MM/DD/YYYY with the MDY hint', () => {
    expect(parseFlexibleDate('06/14/2026', 'MDY')).toBe(new Date(2026, 5, 14).getTime());
  });

  it('auto-parses an ISO-ish timestamp (real Cashew shape)', () => {
    const t = parseFlexibleDate('2026-06-30 20:34:35.000', 'auto');
    expect(t).not.toBeNull();
    expect(new Date(t!).getFullYear()).toBe(2026);
  });

  it('auto-parses a slash-separated month-name timestamp (real MoneyView shape)', () => {
    const t = parseFlexibleDate('2022/Oct/01 00:00:00', 'auto');
    expect(t).not.toBeNull();
    expect(new Date(t!).getMonth()).toBe(9); // October
  });

  it('returns null for an empty or unparseable string', () => {
    expect(parseFlexibleDate('', 'auto')).toBeNull();
    expect(parseFlexibleDate('not a date', 'auto')).toBeNull();
  });
});
