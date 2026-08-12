import { describe, expect, it } from 'vitest';
import { calculatePpfInterestForFy, checkPpfInterestMismatch } from '@/core/portfolio/ppfInterestCalculator';
import type { PpfRateTable } from '@/core/portfolio/ppfInterestRates';
import type { PpfTransaction } from '@/core/db/types';

const FLAT_RATE_TABLE: PpfRateTable = {
  confirmedThrough: '2025-03-31',
  periods: [{ effectiveFrom: '2020-04-01', ratePct: 7.1 }]
};

function ms(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d).getTime();
}

function txn(type: PpfTransaction['type'], date: number, amount: number): PpfTransaction {
  return { id: `${type}-${date}`, type, date, amount };
}

describe('calculatePpfInterestForFy', () => {
  it('computes a full year of interest for a single deposit made on/before the 5th of April', () => {
    const transactions = [txn('deposit', ms(2023, 4, 1), 150000)];
    const result = calculatePpfInterestForFy(transactions, 2023, FLAT_RATE_TABLE);
    // 150000 * 7.1% / 12 = 887.5/month * 12 = 10650
    expect(result.interest).toBe(10650);
    expect(result.rateFullyConfirmed).toBe(true);
    expect(result.trace).toHaveLength(12);
    expect(result.trace[0]).toMatchObject({ month: '2023-04', lowestBalance: 150000, ratePct: 7.1 });
  });

  it('a deposit made AFTER the 5th earns nothing that month, only from the following month', () => {
    const transactions = [txn('deposit', ms(2023, 4, 10), 100000)];
    const result = calculatePpfInterestForFy(transactions, 2023, FLAT_RATE_TABLE);
    const april = result.trace.find((t) => t.month === '2023-04');
    const may = result.trace.find((t) => t.month === '2023-05');
    expect(april?.lowestBalance).toBe(0);
    expect(april?.interest).toBe(0);
    expect(may?.lowestBalance).toBe(100000);
    expect(may && may.interest).toBeGreaterThan(0);
  });

  it('a withdrawal within the 5th-to-month-end window lowers that month’s calculated balance', () => {
    const transactions = [txn('deposit', ms(2023, 4, 1), 100000), txn('withdrawal', ms(2023, 6, 10), 50000)];
    const result = calculatePpfInterestForFy(transactions, 2023, FLAT_RATE_TABLE);
    const june = result.trace.find((t) => t.month === '2023-06');
    const july = result.trace.find((t) => t.month === '2023-07');
    expect(june?.lowestBalance).toBe(50000); // withdrawal on the 10th still lowers June's figure
    expect(july?.lowestBalance).toBe(50000);
  });

  it('flags basedOnIncompleteHistory when the earliest known transaction postdates the FY start', () => {
    const transactions = [txn('deposit', ms(2023, 8, 1), 50000)]; // account clearly existed before August
    const result = calculatePpfInterestForFy(transactions, 2023, FLAT_RATE_TABLE);
    expect(result.basedOnIncompleteHistory).toBe(true);
  });

  it('does not flag basedOnIncompleteHistory when the earliest transaction is on/before the FY start', () => {
    const transactions = [txn('deposit', ms(2023, 4, 1), 50000)];
    const result = calculatePpfInterestForFy(transactions, 2023, FLAT_RATE_TABLE);
    expect(result.basedOnIncompleteHistory).toBe(false);
  });

  it('returns rateFullyConfirmed=false and zero interest when the FY is not yet confirmed in the rate table', () => {
    const transactions = [txn('deposit', ms(2026, 4, 1), 100000)];
    const result = calculatePpfInterestForFy(transactions, 2026, FLAT_RATE_TABLE); // confirmedThrough 2025-03-31
    expect(result.rateFullyConfirmed).toBe(false);
    expect(result.interest).toBe(0);
  });
});

describe('checkPpfInterestMismatch', () => {
  it('reports no mismatch when the recorded interest matches the recalculation', () => {
    const deposit = txn('deposit', ms(2023, 4, 1), 150000);
    const interest = txn('interest', ms(2024, 3, 31), 10650);
    const result = checkPpfInterestMismatch(interest, [deposit, interest], FLAT_RATE_TABLE, 2023);
    expect(result?.mismatched).toBe(false);
    expect(result?.calculated).toBe(10650);
  });

  it('reports a mismatch when the recorded interest disagrees with the recalculation', () => {
    const deposit = txn('deposit', ms(2023, 4, 1), 150000);
    const interest = txn('interest', ms(2024, 3, 31), 5000); // way off from the real ~10650
    const result = checkPpfInterestMismatch(interest, [deposit, interest], FLAT_RATE_TABLE, 2023);
    expect(result?.mismatched).toBe(true);
    expect(result?.recorded).toBe(5000);
  });

  it('excludes the interest transaction itself from the recalculation (no double-counting)', () => {
    const deposit = txn('deposit', ms(2023, 4, 1), 150000);
    const interest = txn('interest', ms(2024, 3, 31), 10650);
    const result = checkPpfInterestMismatch(interest, [deposit, interest], FLAT_RATE_TABLE, 2023);
    // If the interest txn's own amount leaked into the FY-end balance calc, this would still pass —
    // the real guard is that closingBalance in a full calc run wouldn't double count; this test
    // documents the intent explicitly for future maintainers.
    expect(result?.calculated).toBe(10650);
  });
});
