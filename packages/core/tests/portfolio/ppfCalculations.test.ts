import { describe, expect, it } from 'vitest';
import {
  ppfDepositsForFy,
  ppfThisYearDeposits,
  ppfBalanceAsOfFyEnd,
  ppfWithdrawalEligibility,
  ppfMaturityMs,
  ppfBuildCardData,
  dateToFyStartYear,
  ppfFyStart,
  earliestBlockingPpfFy
} from '@/core/portfolio/ppfCalculations';
import type { PpfTransaction } from '@/core/db/types';

function ms(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d).getTime();
}

function txn(type: PpfTransaction['type'], date: number, amount: number): PpfTransaction {
  return { id: `${type}-${date}`, type, date, amount };
}

describe('ppfDepositsForFy', () => {
  it('sums only deposit transactions within the given financial year', () => {
    const txns = [
      txn('deposit', ms(2023, 4, 1), 50000),
      txn('deposit', ms(2023, 6, 15), 30000),
      txn('interest', ms(2024, 3, 31), 10650), // not a deposit — excluded
      txn('deposit', ms(2024, 4, 1), 100000) // next FY — excluded
    ];
    expect(ppfDepositsForFy(txns, 2023)).toBe(80000);
    expect(ppfDepositsForFy(txns, 2024)).toBe(100000);
  });

  it('returns 0 for a financial year with no deposits', () => {
    const txns = [txn('deposit', ms(2023, 4, 1), 50000)];
    expect(ppfDepositsForFy(txns, 2022)).toBe(0);
  });

  it('correctly excludes withdrawals', () => {
    const txns = [txn('deposit', ms(2023, 4, 1), 50000), txn('withdrawal', ms(2023, 6, 1), 20000)];
    expect(ppfDepositsForFy(txns, 2023)).toBe(50000);
  });
});

describe('ppfThisYearDeposits', () => {
  it('matches ppfDepositsForFy called with the current financial year', () => {
    const currentFy = dateToFyStartYear(ppfFyStart().getTime());
    const txns = [txn('deposit', ppfFyStart().getTime(), 75000)];
    expect(ppfThisYearDeposits(txns)).toBe(ppfDepositsForFy(txns, currentFy));
    expect(ppfThisYearDeposits(txns)).toBe(75000);
  });
});

describe('ppfBalanceAsOfFyEnd', () => {
  it('sums every transaction up to and including the end of the given FY', () => {
    const txns = [
      txn('deposit', ms(2020, 4, 1), 100000),
      txn('interest', ms(2021, 3, 31), 7000),
      txn('deposit', ms(2021, 6, 1), 50000) // after FY2020-21 ends — excluded
    ];
    expect(ppfBalanceAsOfFyEnd(txns, 2020)).toBe(107000);
  });

  it('subtracts withdrawals', () => {
    const txns = [txn('deposit', ms(2020, 4, 1), 100000), txn('withdrawal', ms(2020, 6, 1), 30000)];
    expect(ppfBalanceAsOfFyEnd(txns, 2020)).toBe(70000);
  });
});

describe('ppfWithdrawalEligibility', () => {
  const currentFy = dateToFyStartYear(Date.now());

  it('returns null when the opening date is unknown', () => {
    expect(ppfWithdrawalEligibility([], undefined)).toBeNull();
  });

  it('is not eligible before the 7th financial year, but still reports when it will be', () => {
    const openingFy = currentFy - 2; // only in the 3rd FY right now
    const openingDate = ms(openingFy, 4, 1);
    const result = ppfWithdrawalEligibility([], openingDate);
    expect(result?.eligible).toBe(false);
    expect(result?.maxWithdrawable).toBe(0);
    expect(result?.eligibleFromFy).toBe(openingFy + 6);
  });

  it('is eligible from the 7th financial year onward and caps at 50% of the LOWER of the two balances', () => {
    const openingFy = currentFy - 6; // exactly at the eligibility boundary (7th FY)
    const openingDate = ms(openingFy, 4, 1);
    const txns = [
      txn('deposit', ms(openingFy, 4, 1), 500000), // already on record by the 4th-preceding-FY cutoff
      txn('deposit', ms(currentFy - 1, 4, 1), 10000) // lands only within the immediately-preceding FY
    ];
    // Balance at end of (currentFy-4) = 500000; balance at end of (currentFy-1) = 510000 — lower is 500000.
    const result = ppfWithdrawalEligibility(txns, openingDate);
    expect(result?.eligible).toBe(true);
    expect(result?.maxWithdrawable).toBe(250000);
  });
});

describe('ppfMaturityMs', () => {
  it('matures 15 years from the END of the financial year of opening, not from the raw opening date (real bug, fixed 2026-08-08)', () => {
    // Opened 10-Jul-2015 — within FY2015-16 (ends 31-Mar-2016). Real rule: matures 1-Apr-2031, NOT
    // 10-Jul-2030 (what a naive "+15 calendar years" gives).
    const opening = ms(2015, 7, 10);
    const maturity = new Date(ppfMaturityMs(opening));
    expect(maturity.getFullYear()).toBe(2031);
    expect(maturity.getMonth()).toBe(3); // April (0-indexed)
    expect(maturity.getDate()).toBe(1);
  });

  it('gives the same maturity date for any opening date within the same financial year', () => {
    const earlyInFy = ppfMaturityMs(ms(2015, 4, 5)); // just after FY2015-16 starts
    const lateInFy = ppfMaturityMs(ms(2016, 3, 25)); // just before FY2015-16 ends
    expect(earlyInFy).toBe(lateInFy);
  });

  it('an account opened exactly on 1 April matures exactly 15 years later, also on 1 April', () => {
    // 1-Apr-2020 is the FIRST day of FY2020-21 (which ends 31-Mar-2021) — 15 years after that FY's
    // end is 31-Mar-2036, i.e. 1-Apr-2036, not 2035 (that would be true only if 1-Apr-2020 belonged
    // to FY2019-20, which it doesn't — April is the first month of the FY it starts, not the last
    // month of the previous one).
    const opening = ms(2020, 4, 1);
    const maturity = new Date(ppfMaturityMs(opening));
    expect(maturity.getFullYear()).toBe(2036);
    expect(maturity.getMonth()).toBe(3);
    expect(maturity.getDate()).toBe(1);
  });
});

describe('ppfBuildCardData — yearsElapsed/yearsLeft consistency', () => {
  it('yearsElapsed and yearsLeft always sum to exactly 15 (both anchored to the same maturity date)', () => {
    const meta = { ppfOpeningDate: ms(2020, 7, 15) };
    const data = ppfBuildCardData(meta, 100000);
    expect(data.yearsElapsed).not.toBeNull();
    expect(data.yearsLeft).not.toBeNull();
    expect((data.yearsElapsed ?? 0) + (data.yearsLeft ?? 0)).toBeCloseTo(15, 5);
  });
});

describe('earliestBlockingPpfFy', () => {
  it('returns null when no FY has missing interest', () => {
    expect(earliestBlockingPpfFy([], ms(2025, 8, 15))).toBeNull();
  });

  it('blocks a transaction dated in a FY after the earliest missing-interest FY', () => {
    // FY2023-24's interest was never recorded; a deposit dated 15-Aug-2025 (FY2025-26, two years
    // past the gap) should be blocked, naming FY2023-24 as the FY to fix first.
    expect(earliestBlockingPpfFy([2023], ms(2025, 8, 15))).toBe(2023);
  });

  it('never blocks a transaction dated within the gap year itself', () => {
    // Still allowed to keep depositing into FY2023-24 right up to its own year-end — that's normal.
    expect(earliestBlockingPpfFy([2023], ms(2024, 3, 31))).toBeNull();
    expect(earliestBlockingPpfFy([2023], ms(2023, 4, 1))).toBeNull();
  });

  it('never blocks a transaction dated before the gap year', () => {
    expect(earliestBlockingPpfFy([2023], ms(2022, 12, 1))).toBeNull();
  });

  it('blocks a transaction dated exactly one FY after the gap year', () => {
    expect(earliestBlockingPpfFy([2023], ms(2024, 4, 1))).toBe(2023);
  });

  it('uses the EARLIEST missing FY when several are missing, not the latest', () => {
    // FY2021-22 and FY2023-24 both missing interest — a transaction dated in FY2025-26 should still
    // name the earliest gap (FY2021-22), the one that actually needs fixing first.
    expect(earliestBlockingPpfFy([2023, 2021], ms(2025, 8, 15))).toBe(2021);
  });

  it('a transaction dated within the earliest gap year is not blocked even if a LATER FY is also missing', () => {
    // Both FY2021-22 and FY2023-24 are missing interest, but a transaction dated inside FY2021-22
    // itself (the earliest gap) is still fine — only entries dated AFTER the earliest gap are blocked.
    expect(earliestBlockingPpfFy([2023, 2021], ms(2021, 6, 1))).toBeNull();
  });
});
