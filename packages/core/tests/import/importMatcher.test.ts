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

  // Real bug, found via on-device testing 2026-08-09: 'auto' used to hand a bare numeric DD/MM/YYYY
  // date straight to the native `Date` constructor, which guesses US MM/DD/YYYY for this shape —
  // silently swapping day/month for any day ≤ 12, and overflowing into a wrong year for day > 12
  // (both confirmed against real Cashew/MoneyView statement rows). 'auto' must mean DMY (India-first
  // default) for this shape, never a native-parser guess.
  it('auto-parses a bare numeric date as DMY (India-first default), not the native US MM/DD/YYYY guess', () => {
    // Day > 12 — native `new Date('25/04/2026')` can't be MM/DD (no 25th month) and used to overflow
    // into a nonsense future date (04 Jan 2028) instead of falling back to DMY.
    expect(new Date(parseFlexibleDate('25/04/2026', 'auto')!).toDateString()).toBe(
      new Date(2026, 3, 25).toDateString()
    );
    // Day ≤ 12 — native `new Date('05/04/2026')` "succeeds" as May 4 2026 (US MM/DD), silently wrong;
    // must resolve to 5 April 2026 instead.
    expect(new Date(parseFlexibleDate('05/04/2026', 'auto')!).toDateString()).toBe(new Date(2026, 3, 5).toDateString());
  });

  // Exact rows from the real Cashew (April) and MoneyView (May) synthetic fixtures that produced
  // wrong 2026/2027/2028 dates on-device before this fix.
  it('auto-parses every reported Cashew/MoneyView regression row correctly', () => {
    const cases: Array<[string, [number, number, number]]> = [
      ['02/04/2026', [2026, 3, 2]],
      ['05/04/2026', [2026, 3, 5]],
      ['10/04/2026', [2026, 3, 10]],
      ['15/04/2026', [2026, 3, 15]],
      ['25/04/2026', [2026, 3, 25]],
      ['03/05/2026', [2026, 4, 3]],
      ['08/05/2026', [2026, 4, 8]],
      ['12/05/2026', [2026, 4, 12]],
      ['18/05/2026', [2026, 4, 18]]
    ];
    for (const [raw, [y, m, d]] of cases) {
      const t = parseFlexibleDate(raw, 'auto');
      expect(t).not.toBeNull();
      expect(new Date(t!).toDateString()).toBe(new Date(y, m, d).toDateString());
    }
  });
});
