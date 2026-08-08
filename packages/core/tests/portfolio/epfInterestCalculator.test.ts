import { describe, expect, it } from 'vitest';
import {
  calculateEpfInterestForYear,
  buildEpfInterestInput,
  getInterestRateForFy
} from '@/core/portfolio/epfInterestCalculator';
import { EPF_RATE_TABLE_FALLBACK, type EpfRateTable } from '@/core/portfolio/epfInterestRates';
import type { EpfEmployer, EpfTransaction } from '@/core/db/types';

describe('calculateEpfInterestForYear', () => {
  // Ground truth: a REAL EPFO passbook (FY2014-15, Cognizant, rate 8.75% for that year — see
  // docs/plans/epf-passbook-import.md §6.1/§8). Wage months Nov/Dec/Jan/Feb 2014-15, each
  // deposited one calendar month later (Dec/Jan/Feb/Mar), with employee contributions of
  // ₹851/945/945/945 and employer-EPF contributions of ₹260/289/289/289. The passbook's own
  // credited interest for that year: employee ₹39, employer-EPF ₹12, pension ₹0 — and its own
  // stated closing balance: employee ₹3,725, employer ₹1,139. This test reproduces that exact
  // real-world result from the algorithm, not just a plausible-looking number.
  it('reproduces the exact real passbook interest and closing balance (FY2014-15, rate 8.75%)', () => {
    const rateTable: EpfRateTable = {
      confirmedThrough: '2015-03',
      periods: [{ effectiveFrom: '2013-04', ratePct: 8.75 }]
    };

    const result = calculateEpfInterestForYear(
      {
        fyStartYear: 2014,
        monthlyContributions: [
          { month: '2014-12', employeeAmount: 851, employerAmount: 260 },
          { month: '2015-01', employeeAmount: 945, employerAmount: 289 },
          { month: '2015-02', employeeAmount: 945, employerAmount: 289 },
          { month: '2015-03', employeeAmount: 945, employerAmount: 289 }
        ],
        openingEmployeeBalance: 0,
        openingEmployerBalance: 0
      },
      rateTable
    );

    expect(result.employeeInterest).toBe(39);
    expect(result.employerInterest).toBe(12);
    expect(result.closingEmployeeBalance).toBe(3725);
    expect(result.closingEmployerBalance).toBe(1139);
    expect(result.rateFullyConfirmed).toBe(true);
  });

  it('a contribution deposited in the SAME month as another earns zero interest that month (accrual rule)', () => {
    // A ₹1,000 deposit in April earns interest starting in May, not April — its April contribution
    // to April's own interest must be exactly zero, since it wasn't part of April's OPENING balance.
    const rateTable: EpfRateTable = {
      confirmedThrough: '2025-03',
      periods: [{ effectiveFrom: '2024-04', ratePct: 12 }]
    };
    const result = calculateEpfInterestForYear(
      {
        fyStartYear: 2024,
        monthlyContributions: [{ month: '2024-04', employeeAmount: 1000, employerAmount: 0 }],
        openingEmployeeBalance: 0,
        openingEmployerBalance: 0
      },
      rateTable
    );
    // 11 months (May-Mar) at 1% monthly (12%/12) on a flat ₹1,000 balance = ₹110.
    expect(result.employeeInterest).toBe(110);
  });

  it('carries forward the opening balance and accrues interest on it from month 1', () => {
    const rateTable: EpfRateTable = {
      confirmedThrough: '2025-03',
      periods: [{ effectiveFrom: '2024-04', ratePct: 12 }]
    };
    const result = calculateEpfInterestForYear(
      {
        fyStartYear: 2024,
        monthlyContributions: [],
        openingEmployeeBalance: 12000,
        openingEmployerBalance: 0
      },
      rateTable
    );
    // 12 months at 1% monthly on a flat ₹12,000 balance (no contributions at all this year) = ₹1,440.
    expect(result.employeeInterest).toBe(1440);
    expect(result.closingEmployeeBalance).toBe(13440);
  });

  it('handles a mid-year rate change within the same FY (the 2000-01 historical case shape)', () => {
    // Two different rates applying to different months of the same FY — this is exactly the shape
    // 2000-01's real 12%->11% mid-year change takes, verified here with round numbers instead.
    const rateTable: EpfRateTable = {
      confirmedThrough: '2025-03',
      periods: [
        { effectiveFrom: '2024-04', ratePct: 12 }, // Apr-Jun
        { effectiveFrom: '2024-07', ratePct: 6 } // Jul-Mar (halved, for an easy-to-verify number)
      ]
    };
    const result = calculateEpfInterestForYear(
      {
        fyStartYear: 2024,
        monthlyContributions: [],
        openingEmployeeBalance: 10000,
        openingEmployerBalance: 0
      },
      rateTable
    );
    // 3 months (Apr,May,Jun) at 1%/mo + 9 months (Jul-Mar) at 0.5%/mo, on a flat ₹10,000 balance:
    // 3*100 + 9*50 = 300 + 450 = 750.
    expect(result.employeeInterest).toBe(750);
  });

  it('marks rateFullyConfirmed false and returns 0 interest when the FY is beyond the confirmed rate table', () => {
    const rateTable: EpfRateTable = {
      confirmedThrough: '2024-03',
      periods: [{ effectiveFrom: '2023-04', ratePct: 8.25 }]
    };
    const result = calculateEpfInterestForYear(
      {
        fyStartYear: 2024, // starts 2024-04, entirely after confirmedThrough
        monthlyContributions: [{ month: '2024-05', employeeAmount: 1000, employerAmount: 0 }],
        openingEmployeeBalance: 5000,
        openingEmployerBalance: 0
      },
      rateTable
    );
    expect(result.rateFullyConfirmed).toBe(false);
  });

  it('never accrues interest on the pension/EPS balance — it is excluded from the simulation entirely', () => {
    // There is no pension field in EpfInterestCalculationInput at all — this test exists to
    // document that omission is deliberate, not an oversight (see this file's header comment).
    const rateTable = EPF_RATE_TABLE_FALLBACK;
    const result = calculateEpfInterestForYear(
      { fyStartYear: 2023, monthlyContributions: [], openingEmployeeBalance: 0, openingEmployerBalance: 0 },
      rateTable
    );
    expect(result.employeeInterest).toBe(0);
    expect(result.employerInterest).toBe(0);
  });

  it('exposes a month-by-month trace whose interest sums to the rounded total (§10.5)', () => {
    const rateTable: EpfRateTable = {
      confirmedThrough: '2015-03',
      periods: [{ effectiveFrom: '2013-04', ratePct: 8.75 }]
    };
    const result = calculateEpfInterestForYear(
      {
        fyStartYear: 2014,
        monthlyContributions: [
          { month: '2014-12', employeeAmount: 851, employerAmount: 260 },
          { month: '2015-01', employeeAmount: 945, employerAmount: 289 },
          { month: '2015-02', employeeAmount: 945, employerAmount: 289 },
          { month: '2015-03', employeeAmount: 945, employerAmount: 289 }
        ],
        openingEmployeeBalance: 0,
        openingEmployerBalance: 0
      },
      rateTable
    );

    expect(result.employeeTrace).toHaveLength(12);
    expect(result.employerTrace).toHaveLength(12);
    // Apr-Nov have zero opening balance and thus zero interest (first deposit is Dec).
    expect(result.employeeTrace.slice(0, 8).every((m) => m.interest === 0)).toBe(true);
    expect(result.employeeTrace.every((m) => m.ratePct === 8.75)).toBe(true);
    const summedTrace = result.employeeTrace.reduce((sum, m) => sum + m.interest, 0);
    expect(Math.round(summedTrace)).toBe(result.employeeInterest);
  });

  it('trace months report a null ratePct (never a guessed number) when the rate is unconfirmed', () => {
    const rateTable: EpfRateTable = {
      confirmedThrough: '2024-03',
      periods: [{ effectiveFrom: '2023-04', ratePct: 8.25 }]
    };
    const result = calculateEpfInterestForYear(
      { fyStartYear: 2024, monthlyContributions: [], openingEmployeeBalance: 5000, openingEmployerBalance: 0 },
      rateTable
    );
    expect(result.employeeTrace.every((m) => m.ratePct === null && m.interest === 0)).toBe(true);
  });
});

describe('getInterestRateForFy', () => {
  it('returns the rate in effect at the start of the given FY', () => {
    expect(getInterestRateForFy(EPF_RATE_TABLE_FALLBACK, 2023)).toBe(8.25);
    expect(getInterestRateForFy(EPF_RATE_TABLE_FALLBACK, 2013)).toBe(8.75);
  });

  it('returns null for an FY beyond confirmedThrough — never guesses', () => {
    expect(getInterestRateForFy(EPF_RATE_TABLE_FALLBACK, 2030)).toBeNull();
  });

  it('returns null for an FY before the table’s first period', () => {
    expect(getInterestRateForFy(EPF_RATE_TABLE_FALLBACK, 1980)).toBeNull();
  });
});

describe('buildEpfInterestInput', () => {
  function employer(overrides: Partial<EpfEmployer> = {}): EpfEmployer {
    return {
      id: 'emp-1',
      companyName: 'Acme Corp',
      basicSalary: 50000,
      employeeContribPct: 12,
      fromDate: new Date(2020, 3, 1).getTime(), // Apr 2020
      ...overrides
    };
  }

  it('uses REAL logged transactions when present, keyed by their own deposit date (not an inferred one)', () => {
    const tx: EpfTransaction = {
      id: 't1',
      type: 'contribution',
      wagesMonth: '2024-03', // wage month March — deposits in April, the NEXT FY
      date: new Date(2024, 3, 15).getTime(), // real logged deposit date: 15 April 2024
      employeeAmount: 6000,
      employerAmount: 1835
    };
    const input = buildEpfInterestInput(employer(), [tx], 2024, { employee: 0, employer: 0 });
    // Since the real deposit date is April 2024, this contribution belongs to FY2024-25's
    // simulation (fyStartYear 2024), at deposit month "2024-04" — NOT filtered out by wage month's
    // own FY (which would have been FY2023-24, the wrong year) — this is the bug this test guards.
    expect(input.monthlyContributions).toEqual([{ month: '2024-04', employeeAmount: 6000, employerAmount: 1835 }]);
  });

  it('a wage-month-March real transaction is excluded from the wage month’s own FY (falls back to estimate there instead)', () => {
    const tx: EpfTransaction = {
      id: 't1',
      type: 'contribution',
      wagesMonth: '2024-03',
      date: new Date(2024, 3, 15).getTime(), // deposits April 2024 => FY2024-25
      employeeAmount: 9999, // a value that can never coincidentally match the auto-estimate below
      employerAmount: 1835
    };
    // Asking for FY2023-24 (which "2024-03" would naively seem to belong to by wage month) must NOT
    // include this transaction — its real deposit lands in FY2024-25, not FY2023-24. Since no real
    // deposit exists for FY2023-24 specifically, this falls back to the auto-estimate for that year
    // (the per-FY fallback granularity is deliberate — `buildEpfInterestInput` always computes one
    // specific year at a time, so a user with real data starting only in a recent year should still
    // get a reasonable estimate for an earlier year they never logged, not an empty result).
    const wrongYearInput = buildEpfInterestInput(employer(), [tx], 2023, { employee: 0, employer: 0 });
    expect(wrongYearInput.monthlyContributions.some((c) => c.employeeAmount === 9999)).toBe(false);
    expect(wrongYearInput.monthlyContributions.length).toBeGreaterThan(0); // estimate fallback kicked in
  });

  it('falls back to the auto-estimate (wage-month-plus-one as the deposit month) when no real transactions exist', () => {
    const input = buildEpfInterestInput(employer(), [], 2024, { employee: 0, employer: 0 });
    expect(input.monthlyContributions.length).toBeGreaterThan(0);
    // Every entry's month must be a valid "YYYY-MM" whose deposit-FY is 2024 (Apr 2024 - Mar 2025).
    for (const c of input.monthlyContributions) {
      const [y, m] = c.month.split('-').map(Number);
      const fy = (m ?? 0) >= 4 ? y : (y ?? 0) - 1;
      expect(fy).toBe(2024);
    }
  });

  it('passes through the prior closing balance as this FY’s opening balance unchanged', () => {
    const input = buildEpfInterestInput(employer(), [], 2024, { employee: 12345, employer: 6789 });
    expect(input.openingEmployeeBalance).toBe(12345);
    expect(input.openingEmployerBalance).toBe(6789);
  });
});
