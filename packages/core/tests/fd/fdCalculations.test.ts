import { describe, it, expect } from 'vitest';
import { calcFdMaturity } from '@/core/fd/fdCalculations';

describe('calcFdMaturity', () => {
  it('matches bank day-count convention (exact days / 365) across a leap-year-spanning tenure', () => {
    // Regression case: ₹4,00,000 @ 8.5% quarterly, 20-Jul-2026 → 21-Jul-2029.
    // Span is 1,097 days (3 years + 1 day, crossing the 2028 leap day), which the bank
    // computes as exponent = 4 × (1097/365) = 12.0274 quarters, not a flat 12 quarters
    // (which would assume an exact, leap-day-blind 3.000-year tenure). Verified against
    // the bank's actual maturity payout of ₹5,15,045.
    const start = new Date('2026-07-20').getTime();
    const maturity = new Date('2029-07-21').getTime();

    const result = calcFdMaturity(400000, 8.5, start, maturity, 'quarterly', start);

    expect(result.maturityAmount).toBe(515045);
  });

  it('compounds a clean whole-year tenure the same as a plain years-based calculation', () => {
    // No leap day in range, tenure is an exact whole number of quarters either way —
    // sanity-checks that the 365-day convention doesn't regress the simple case.
    const start = new Date('2025-01-01').getTime();
    const maturity = new Date('2026-01-01').getTime(); // 365 days exactly
    const principal = 100000;
    const ratePercent = 7;

    const result = calcFdMaturity(principal, ratePercent, start, maturity, 'quarterly', start);
    const expected = principal * Math.pow(1 + 0.07 / 4, 4);

    expect(result.maturityAmount).toBe(Math.round(expected));
  });

  it('is more accurate for leap-spanning tenures than the previous 365.25-day divisor', () => {
    const start = new Date('2026-07-20').getTime();
    const maturity = new Date('2029-07-21').getTime();

    const result = calcFdMaturity(400000, 8.5, start, maturity, 'quarterly', start);
    const oldBuggyAmount = 514956; // what the 365.25-day divisor produced for this scenario

    expect(result.maturityAmount).not.toBe(oldBuggyAmount);
    expect(result.maturityAmount).toBeGreaterThan(oldBuggyAmount);
  });
});
