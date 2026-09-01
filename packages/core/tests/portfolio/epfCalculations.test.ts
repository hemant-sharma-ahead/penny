import { describe, expect, it } from 'vitest';
import {
  epfComputeAllMonths,
  epfBuildCardData,
  epfCheckWageDiscrepancy,
  epfEmployersCoveringMonth,
  epfEmployerForWagesMonth,
  epfLastRealEvidenceMs,
  epfDaysInMonth,
  epfMonthKeyOf,
  epfEmployerForDate,
  epfResolveTxnEmployer,
  estimateProRataEdgeDate,
  checkProRataConsistency,
  estimateGrossAndCtc,
  EPF_DEFAULT_BASIC_TO_GROSS_PCT,
  buildEpfHikeJourney,
  findUnrecordedEpfHikes,
  epfExperienceLabel,
  epfEmployerTotals
} from '@/core/portfolio/epfCalculations';
import type { AssetMeta, EpfEmployer, EpfTransaction } from '@/core/db/types';

function employer(overrides: Partial<EpfEmployer> = {}): EpfEmployer {
  return {
    id: 'e1',
    companyName: 'Acme Corp',
    basicSalary: 40000,
    employeeContribPct: 12,
    fromDate: new Date(2023, 3, 1).getTime(), // Apr 2023
    toDate: new Date(2023, 8, 30).getTime(), // Sep 2023 — closed range, deterministic month count
    ...overrides
  };
}

/** Strips `toDate` entirely (never sets it to `undefined`) — this repo's `exactOptionalPropertyTypes`
 *  convention, matching `epfImportLogic.ts`'s own `extendEmployerCoverage`. Used by tests that need a
 *  genuinely "current" (open-ended) employer built from the `employer()` fixture, which always sets
 *  `toDate` by default. */
function stillCurrent(emp: EpfEmployer): EpfEmployer {
  const { toDate, ...rest } = emp;
  void toDate;
  return rest;
}

function contributionTxn(overrides: Partial<EpfTransaction> = {}): EpfTransaction {
  return {
    id: 't1',
    type: 'contribution',
    wagesMonth: '2023-05',
    date: new Date(2023, 5, 15).getTime(),
    employeeAmount: 5000,
    employerAmount: 1500,
    pensionAmount: 3000,
    ...overrides
  };
}

describe('epfComputeAllMonths', () => {
  it('estimates every month from the formula when no real transactions are passed', () => {
    const months = epfComputeAllMonths([employer()]);
    expect(months).toHaveLength(6); // Apr–Sep 2023
    for (const m of months) {
      expect(m.isReal).toBe(false);
      expect(m.empAmount).toBe(Math.round(40000 * 0.12));
      expect(m.eplrEpfAmount).toBe(Math.round(40000 * 0.0367));
    }
  });

  it("uses a real logged transaction's own amounts for its matching wagesMonth instead of the estimate", () => {
    const txn = contributionTxn(); // wagesMonth: '2023-05'
    const months = epfComputeAllMonths([employer()], [txn]);
    const april = months.find((m) => m.month === '2023-04');
    const may = months.find((m) => m.month === '2023-05');

    expect(april?.isReal).toBe(false);
    expect(april?.empAmount).toBe(Math.round(40000 * 0.12));

    expect(may?.isReal).toBe(true);
    expect(may?.empAmount).toBe(5000);
    expect(may?.eplrEpfAmount).toBe(1500);
    expect(may?.epsAmount).toBe(3000);
  });

  it('ignores non-contribution transactions and contribution transactions with no wagesMonth', () => {
    const interestTxn: EpfTransaction = { id: 't2', type: 'interest', date: Date.now(), amount: 100 };
    const noMonthTxn: EpfTransaction = {
      id: 't3',
      type: 'contribution',
      date: Date.now(),
      employeeAmount: 999,
      employerAmount: 999
    };
    const months = epfComputeAllMonths([employer()], [interestTxn, noMonthTxn]);
    expect(months.every((m) => !m.isReal)).toBe(true);
  });

  it('defaults transactions to an empty array when omitted (backward compatible)', () => {
    expect(() => epfComputeAllMonths([employer()])).not.toThrow();
  });

  // Real bug this exists to fix (found via real-device testing): importing a passbook year with no
  // contribution rows at all (e.g. the person had already left) was still getting every one of that
  // year's months filled in with the formula estimate, fabricating contributions the real passbook
  // explicitly shows never happened.
  it('treats a month with no real transaction inside a CONFIRMED financial year as a real zero, not an estimate', () => {
    const emp = employer({ confirmedFys: [2023] });
    const months = epfComputeAllMonths([emp]); // no transactions at all
    for (const m of months) {
      expect(m.isReal).toBe(true);
      expect(m.empAmount).toBe(0);
      expect(m.eplrEpfAmount).toBe(0);
      expect(m.epsAmount).toBe(0);
      expect(m.proRata).toBeUndefined();
    }
  });

  it('still estimates months outside any confirmed FY, even for the same employer', () => {
    const emp = employer({
      fromDate: new Date(2022, 3, 1).getTime(), // Apr 2022
      toDate: new Date(2023, 8, 30).getTime(), // Sep 2023 — spans FY2022-23 and FY2023-24
      confirmedFys: [2023] // only FY2023-24 confirmed
    });
    const months = epfComputeAllMonths([emp]);
    const unconfirmedMonth = months.find((m) => m.month === '2022-06');
    const confirmedMonth = months.find((m) => m.month === '2023-06');
    expect(unconfirmedMonth?.isReal).toBe(false);
    expect(unconfirmedMonth?.empAmount).toBeGreaterThan(0); // still a formula estimate
    expect(confirmedMonth?.isReal).toBe(true);
    expect(confirmedMonth?.empAmount).toBe(0); // confirmed real zero, not an estimate
  });

  it('a real transaction inside a confirmed FY still wins over the confirmed-zero default', () => {
    const emp = employer({ confirmedFys: [2023] });
    const txn = contributionTxn(); // wagesMonth: '2023-05', real amount 5000
    const months = epfComputeAllMonths([emp], [txn]);
    const may = months.find((m) => m.month === '2023-05');
    const june = months.find((m) => m.month === '2023-06');
    expect(may?.isReal).toBe(true);
    expect(may?.empAmount).toBe(5000); // the real transaction's own amount
    expect(june?.isReal).toBe(true);
    expect(june?.empAmount).toBe(0); // confirmed real zero — no transaction, no estimate
  });
});

describe('epfBuildCardData', () => {
  function baseMeta(overrides: Partial<AssetMeta> = {}): AssetMeta {
    return {
      epfEmployers: [employer()],
      epfTransactions: [],
      ...overrides
    };
  }

  it('always sums employee/employer/pension totals from the blended epfComputeAllMonths output, never txns directly', () => {
    const txn = contributionTxn(); // 2023-06 real month
    const data = epfBuildCardData(baseMeta({ epfTransactions: [txn] }));
    const months = epfComputeAllMonths([employer()], [txn]);
    const expectedEmployee = months.reduce((s, m) => s + m.empAmount, 0);
    const expectedEmployer = months.reduce((s, m) => s + m.eplrEpfAmount, 0);
    const expectedPension = months.reduce((s, m) => s + m.epsAmount, 0);

    expect(data.employeeTotal).toBe(expectedEmployee);
    expect(data.employerTotal).toBe(expectedEmployer);
    expect(data.pensionTotal).toBe(expectedPension);
    // corpus = employee + employer only (pension is informational, never added — see doc comment)
    expect(data.corpus).toBe(expectedEmployee + expectedEmployer);
  });

  it('still returns the same totals as before when there are no real transactions at all (pure estimate)', () => {
    const data = epfBuildCardData(baseMeta());
    const months = epfComputeAllMonths([employer()]);
    const expectedEmployee = months.reduce((s, m) => s + m.empAmount, 0);
    const expectedEmployer = months.reduce((s, m) => s + m.eplrEpfAmount, 0);

    expect(data.employeeTotal).toBe(expectedEmployee);
    expect(data.employerTotal).toBe(expectedEmployer);
    expect(data.corpus).toBe(expectedEmployee + expectedEmployer);
  });

  it('does not add pensionTotal into corpus', () => {
    const data = epfBuildCardData(baseMeta({ epfTransactions: [contributionTxn()] }));
    expect(data.pensionTotal).toBeGreaterThan(0);
    expect(data.corpus).toBe(data.employeeTotal + data.employerTotal);
  });

  it('still sums interest/transfer_in/withdrawal/advance straight from real transactions (unchanged)', () => {
    const interestTxn: EpfTransaction = { id: 'i1', type: 'interest', date: Date.now(), amount: 200 };
    const transferTxn: EpfTransaction = { id: 'x1', type: 'transfer_in', date: Date.now(), amount: 1000 };
    const withdrawalTxn: EpfTransaction = { id: 'w1', type: 'withdrawal', date: Date.now(), amount: 300 };
    const data = epfBuildCardData(baseMeta({ epfTransactions: [interestTxn, transferTxn, withdrawalTxn] }));

    expect(data.interestEarned).toBe(200);
    const months = epfComputeAllMonths([employer()], [interestTxn, transferTxn, withdrawalTxn]);
    const expectedEmployee = months.reduce((s, m) => s + m.empAmount, 0);
    const expectedEmployer = months.reduce((s, m) => s + m.eplrEpfAmount, 0);
    expect(data.corpus).toBe(Math.max(0, expectedEmployee + expectedEmployer + 200 + 1000 - 300));
  });
});

describe('epfCheckWageDiscrepancy', () => {
  it('returns null when the real amount matches the predicted amount within tolerance', () => {
    const emp = employer({ basicSalary: 40000, employeeContribPct: 12 }); // predicted = 4800
    expect(epfCheckWageDiscrepancy(emp, '2023-05', 4800)).toBeNull();
    expect(epfCheckWageDiscrepancy(emp, '2023-05', 4850)).toBeNull(); // within 2%
  });

  it("flags 'higher' when the real amount exceeds the model by more than the tolerance", () => {
    const emp = employer({ basicSalary: 40000, employeeContribPct: 12 }); // predicted = 4800
    const result = epfCheckWageDiscrepancy(emp, '2023-05', 6000);
    expect(result).toEqual({ direction: 'higher', realAmount: 6000, predictedAmount: 4800 });
  });

  it("flags 'lower' when the real amount is below the model by more than the tolerance", () => {
    const emp = employer({ basicSalary: 40000, employeeContribPct: 12 }); // predicted = 4800
    const result = epfCheckWageDiscrepancy(emp, '2023-05', 3000);
    expect(result).toEqual({ direction: 'lower', realAmount: 3000, predictedAmount: 4800 });
  });

  it('uses the hike timeline to compute the predicted amount for a given wages month', () => {
    const emp = employer({
      basicSalary: 40000,
      employeeContribPct: 12,
      hikeTimeline: [{ fromDate: new Date(2023, 6, 1).getTime(), basicSalary: 60000 }] // Jul 2023
    });
    // Before the hike: predicted stays 4800.
    expect(epfCheckWageDiscrepancy(emp, '2023-05', 4800)).toBeNull();
    // After the hike: predicted becomes 7200 — the same 4800 real amount now looks 'lower'.
    const result = epfCheckWageDiscrepancy(emp, '2023-08', 4800);
    expect(result).toEqual({ direction: 'lower', realAmount: 4800, predictedAmount: 7200 });
  });

  it('returns null when the predicted amount is zero or negative (nothing to compare against)', () => {
    const emp = employer({ basicSalary: 0, employeeContribPct: 12 });
    expect(epfCheckWageDiscrepancy(emp, '2023-05', 1000)).toBeNull();
  });
});

// A mid-month employer switch (e.g. leaving Company A partway through August, joining Company B the
// same month) means both employers' `[fromDate, toDate]` ranges can genuinely cover the same wages
// month — found via real-device testing to cause a false reconciliation conflict when this wasn't
// handled (see docs/plans/epf-passbook-import.md §10.8, `epfImportLogic.ts`'s `reconcileUnit`).
describe('epfEmployersCoveringMonth / epfEmployerForWagesMonth', () => {
  // `epfEmployersCoveringMonth` samples the 15th of the month as the representative point (same
  // convention `epfComputeAllMonths`/the Excel exporter's date-range check already use) — these two
  // ranges are set up so BOTH independently contain Aug 15 2017, the genuine-ambiguity shape a tight
  // mid-month switch can produce (e.g. the passbook posts each side's deposit a few days apart).
  const companyA = employer({
    id: 'a',
    companyName: 'Company A',
    fromDate: new Date(2016, 3, 1).getTime(),
    toDate: new Date(2017, 7, 20).getTime()
  }); // Apr 2016 - 20 Aug 2017
  const companyB = employer({
    id: 'b',
    companyName: 'Company B',
    fromDate: new Date(2017, 7, 10).getTime(),
    toDate: new Date(2018, 2, 31).getTime()
  }); // 10 Aug 2017 - Mar 2018

  it('finds exactly one employer for an unambiguous month', () => {
    expect(epfEmployersCoveringMonth([companyA, companyB], '2016-06')).toEqual([companyA]);
    expect(epfEmployerForWagesMonth([companyA, companyB], '2016-06')).toBe(companyA);
  });

  it('finds BOTH employers for a genuine mid-month switch month, in either order', () => {
    const covering = epfEmployersCoveringMonth([companyA, companyB], '2017-08');
    expect(covering).toHaveLength(2);
    expect(covering.map((e) => e.id).sort()).toEqual(['a', 'b']);
  });

  it('epfEmployerForWagesMonth returns null (never guesses) for an ambiguous switch month', () => {
    expect(epfEmployerForWagesMonth([companyA, companyB], '2017-08')).toBeNull();
  });

  it('returns an empty array / null when no employer covers the month at all', () => {
    expect(epfEmployersCoveringMonth([companyA, companyB], '2020-01')).toEqual([]);
    expect(epfEmployerForWagesMonth([companyA, companyB], '2020-01')).toBeNull();
  });
});

// The real reported bug (2026-08-11 follow-up round): after a genuine mid-month switch left BOTH
// employers "current" (no `toDate`), a real transaction belonging to the NEW employer's wage month
// was also displayed under the OLD employer's identical wage month, because the lookup only keyed on
// `wagesMonth`, with no employer scoping at all.
describe('epfComputeAllMonths — employer-scoped real-transaction matching', () => {
  it('never bleeds a real transaction into a second employer covering the same wagesMonth', () => {
    // Reproduces the exact broken shape: BOTH left "current" (no toDate) after a switch that was
    // never resolved — Cognizant (a) and the new company (b) both cover September 2017.
    const cognizant = stillCurrent(
      employer({
        id: 'a',
        companyName: 'Cognizant',
        basicSalary: 0, // never set — matches the real bug's "estimate silently computes to 0" symptom
        fromDate: new Date(2013, 0, 1).getTime()
      })
    );
    const newCo = stillCurrent(
      employer({ id: 'b', companyName: 'New Co', basicSalary: 50000, fromDate: new Date(2017, 7, 15).getTime() })
    );

    const newCoSeptTxn = contributionTxn({
      id: 'sept-newco',
      employerId: 'b',
      wagesMonth: '2017-09',
      employeeAmount: 6000,
      employerAmount: 1835,
      pensionAmount: 4165
    });

    const months = epfComputeAllMonths([cognizant, newCo], [newCoSeptTxn]);
    const cognizantSept = months.find((m) => m.employerId === 'a' && m.month === '2017-09');
    const newCoSept = months.find((m) => m.employerId === 'b' && m.month === '2017-09');

    // The real transaction shows up correctly under its OWN employer...
    expect(newCoSept?.isReal).toBe(true);
    expect(newCoSept?.empAmount).toBe(6000);
    // ...and never leaks into Cognizant's own September entry, which stays whatever ITS OWN estimate
    // says (0, since its own basicSalary was never set) — not New Co's real 6000.
    expect(cognizantSept?.empAmount).not.toBe(6000);
  });

  it('tags every entry with its own employerId', () => {
    const emp = employer();
    const months = epfComputeAllMonths([emp]);
    expect(months.every((m) => m.employerId === emp.id)).toBe(true);
  });

  it('a legacy transaction with no employerId still resolves via unambiguous date-range containment', () => {
    const emp = employer({
      id: 'solo',
      fromDate: new Date(2023, 3, 1).getTime(),
      toDate: new Date(2023, 8, 30).getTime()
    });
    const legacyTxn = contributionTxn({ employerId: undefined, wagesMonth: '2023-05', employeeAmount: 7777 });
    const months = epfComputeAllMonths([emp], [legacyTxn]);
    const may = months.find((m) => m.month === '2023-05');
    expect(may?.isReal).toBe(true);
    expect(may?.empAmount).toBe(7777);
  });
});

describe('epfLastRealEvidenceMs', () => {
  it('returns null when there is no real evidence at all (e.g. a purely manual employer)', () => {
    expect(epfLastRealEvidenceMs(employer({ confirmedFys: undefined }), [employer()], [])).toBeNull();
  });

  it("returns the latest real contribution's wage month for this employer", () => {
    const emp = employer({ id: 'a' });
    const txns = [
      contributionTxn({ employerId: 'a', wagesMonth: '2023-04' }),
      contributionTxn({ employerId: 'a', wagesMonth: '2023-07' })
    ];
    expect(epfLastRealEvidenceMs(emp, [emp], txns)).toBe(new Date('2023-07-01T00:00:00').getTime());
  });

  it('a confirmed contribution-free FY still counts as real evidence, through its own FY-end', () => {
    const emp = employer({ id: 'a', confirmedFys: [2023] });
    expect(epfLastRealEvidenceMs(emp, [emp], [])).toBe(new Date(2024, 2, 31, 23, 59, 59, 999).getTime());
  });

  it('never attributes a transaction belonging to a DIFFERENT employer', () => {
    const a = employer({ id: 'a' });
    const b = employer({ id: 'b', companyName: 'Other Co' });
    const txn = contributionTxn({ employerId: 'b', wagesMonth: '2023-07' });
    expect(epfLastRealEvidenceMs(a, [a, b], [txn])).toBeNull();
  });
});

// Fix 2b — an employer left "current" but not yet `currentEmploymentConfirmed` must never be
// projected with fabricated (estimate or confirmed-zero) months past its own last real evidence,
// regardless of whether the reactive "Are you still working at X?" nudge is ever answered.
describe('epfComputeAllMonths — stale-projection cap (Fix 2b)', () => {
  function currentEmployer(overrides: Partial<EpfEmployer> = {}): EpfEmployer {
    return stillCurrent(employer({ id: 'stale', fromDate: new Date(2023, 3, 1).getTime(), ...overrides }));
  }

  it('caps projection at the latest real contribution when unconfirmed — no fabricated later months', () => {
    const emp = currentEmployer();
    const txn = contributionTxn({ employerId: 'stale', wagesMonth: '2023-08', employeeAmount: 4000 });
    const months = epfComputeAllMonths([emp], [txn]);
    expect(months.some((m) => m.month > '2023-08')).toBe(false);
    expect(months.find((m) => m.month === '2023-08')?.isReal).toBe(true);
  });

  it('caps at the confirmed-FY end when there are zero real contributions but a confirmedFy exists', () => {
    const emp = currentEmployer({ confirmedFys: [2023] });
    const months = epfComputeAllMonths([emp]);
    expect(months.every((m) => m.month <= '2024-03')).toBe(true);
    expect(months.some((m) => m.month > '2024-03')).toBe(false);
  });

  it('projects all the way to "now" once currentEmploymentConfirmed is true, even past real evidence', () => {
    const emp = currentEmployer({ currentEmploymentConfirmed: true });
    const txn = contributionTxn({ employerId: 'stale', wagesMonth: '2023-08', employeeAmount: 4000 });
    const months = epfComputeAllMonths([emp], [txn]);
    // Should reach at least the current real-world month — a purely mechanical "not capped" check.
    const nowMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    expect(months.some((m) => m.month === nowMonth)).toBe(true);
  });

  it('a purely manual employer (never imported, no real evidence at all) still projects to "now" unchanged', () => {
    const emp = currentEmployer(); // no confirmedFys, no toDate, no currentEmploymentConfirmed
    const months = epfComputeAllMonths([emp]); // zero transactions — epfLastRealEvidenceMs is null
    const nowMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    expect(months.some((m) => m.month === nowMonth)).toBe(true);
  });
});

describe('estimateProRataEdgeDate', () => {
  it('falls back to day 1 (start edge) when there is no full-month reference', () => {
    expect(estimateProRataEdgeDate(31, 500, 0, 'start')).toBe(1);
  });

  it('falls back to the last day (end edge) when the amount already looks like a full month', () => {
    expect(estimateProRataEdgeDate(30, 5000, 5000, 'end')).toBe(30);
  });

  it('suggests a join day consistent with a partial-month amount', () => {
    // ₹124 of a ₹1,278 full month, 31-day month — implies ~3 days worked, so joined near month-end.
    const day = estimateProRataEdgeDate(31, 124, 1278, 'start');
    expect(day).toBeGreaterThan(25);
    expect(day).toBeLessThanOrEqual(31);
  });

  it('suggests a leaving day consistent with a partial-month amount', () => {
    // Same ratio, 'end' edge — implies leaving a few days into the month.
    const day = estimateProRataEdgeDate(31, 124, 1278, 'end');
    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThan(6);
  });
});

describe('checkProRataConsistency', () => {
  it('reports consistent when the chosen day matches the real amount within tolerance', () => {
    const suggestedDay = estimateProRataEdgeDate(31, 124, 1278, 'start');
    const result = checkProRataConsistency(suggestedDay, 31, 124, 1278, 'start');
    expect(result.consistent).toBe(true);
  });

  it('reports inconsistent when the chosen day contradicts the real amount', () => {
    // Picking day 1 (i.e. "worked the whole month") when the real amount was a small partial figure.
    const result = checkProRataConsistency(1, 31, 124, 1278, 'start');
    expect(result.consistent).toBe(false);
    expect(result.impliedAmount).toBe(1278);
  });
});

describe('estimateGrossAndCtc', () => {
  it('uses the default 50% basic-to-gross ratio when none is given', () => {
    const result = estimateGrossAndCtc(25000, 3000, 1835, 4165);
    expect(result.basicToGrossPct).toBe(EPF_DEFAULT_BASIC_TO_GROSS_PCT);
    expect(result.estimatedGross).toBe(50000); // 25000 / 0.5
  });

  it('honours a custom ratio', () => {
    const result = estimateGrossAndCtc(25000, 3000, 1835, 4165, 40);
    expect(result.estimatedGross).toBe(62500); // 25000 / 0.4
  });

  it('CTC includes gross + employer EPF + EPS + gratuity accrual, never less than gross alone', () => {
    const result = estimateGrossAndCtc(25000, 3000, 1835, 4165, 50);
    expect(result.estimatedCtc).toBeGreaterThan(result.estimatedGross);
    expect(result.estimatedCtc).toBe(
      result.estimatedGross + result.monthlyEmployerEpf + result.monthlyEps + result.monthlyGratuityAccrual
    );
  });

  it('falls back to the default ratio for a zero/invalid override rather than dividing by zero', () => {
    const result = estimateGrossAndCtc(25000, 3000, 0, 0, 0);
    expect(result.basicToGrossPct).toBe(EPF_DEFAULT_BASIC_TO_GROSS_PCT);
    expect(result.estimatedGross).toBe(50000);
  });

  it('annualizes Gross and CTC — the conventional way both are quoted in India', () => {
    const result = estimateGrossAndCtc(25000, 3000, 1835, 4165, 50);
    expect(result.annualGross).toBe(result.estimatedGross * 12);
    expect(result.annualCtc).toBe(result.estimatedCtc * 12);
  });

  it("netMonthly is Gross minus the employee's own EPF deduction, never negative", () => {
    const result = estimateGrossAndCtc(25000, 3000, 1835, 4165, 50);
    expect(result.netMonthly).toBe(result.estimatedGross - 3000);

    // An implausibly large employee deduction (e.g. bad data) clamps to 0, never negative.
    const clamped = estimateGrossAndCtc(25000, 999999, 1835, 4165, 50);
    expect(clamped.netMonthly).toBe(0);
  });
});

describe('epfDaysInMonth', () => {
  it('returns the correct day count for a 31-day, 30-day, and February month', () => {
    expect(epfDaysInMonth('2023-08')).toBe(31);
    expect(epfDaysInMonth('2023-09')).toBe(30);
    expect(epfDaysInMonth('2024-02')).toBe(29); // leap year
    expect(epfDaysInMonth('2023-02')).toBe(28);
  });
});

describe('epfMonthKeyOf', () => {
  it('returns "YYYY-MM" for a date anywhere within that month', () => {
    expect(epfMonthKeyOf(new Date(2025, 4, 1).getTime())).toBe('2025-05');
    expect(epfMonthKeyOf(new Date(2025, 4, 15).getTime())).toBe('2025-05');
    expect(epfMonthKeyOf(new Date(2025, 4, 31).getTime())).toBe('2025-05');
  });

  // The real bug this exists to fix (docs/plans/epf-passbook-import.md's follow-up round): a joining
  // date mid-month (e.g. 15 May) and a wagesMonth of "2025-05" are the SAME month, even though
  // `fromDate`'s raw epoch ms is numerically LATER than the wagesMonth's own 1st-of-month timestamp
  // — comparing raw ms directly (instead of at month granularity) produces a false "predates joining"
  // reading for literally every employer's own joining month.
  it('lets a mid-month date and its own wage month compare equal, unlike raw epoch ms', () => {
    const midMonthFromDate = new Date(2025, 4, 15).getTime();
    const wageMonthFirstOfMonthMs = new Date('2025-05-01T00:00:00').getTime();
    expect(wageMonthFirstOfMonthMs < midMonthFromDate).toBe(true); // the raw-ms trap
    expect(epfMonthKeyOf(midMonthFromDate) === '2025-05').toBe(true); // the correct comparison
  });
});

describe('epfEmployerForDate', () => {
  const companyA = employer({
    id: 'a',
    fromDate: new Date(2016, 3, 1).getTime(),
    toDate: new Date(2017, 7, 20).getTime()
  });
  const companyB = employer({
    id: 'b',
    fromDate: new Date(2017, 7, 10).getTime(),
    toDate: new Date(2018, 2, 31).getTime()
  });

  it('finds the single employer covering an unambiguous date', () => {
    expect(epfEmployerForDate([companyA, companyB], new Date(2016, 5, 1).getTime())).toBe(companyA);
  });

  it('never guesses when two employers both cover the date (a genuine switch window)', () => {
    expect(epfEmployerForDate([companyA, companyB], new Date(2017, 7, 15).getTime())).toBeNull();
  });

  it('returns null when no employer covers the date at all', () => {
    expect(epfEmployerForDate([companyA, companyB], new Date(2020, 0, 1).getTime())).toBeNull();
  });
});

describe('epfResolveTxnEmployer — now resolves every transaction type, not just contribution', () => {
  const empA = employer({ id: 'a', fromDate: new Date(2023, 3, 1).getTime(), toDate: new Date(2023, 7, 31).getTime() });
  const empB = stillCurrent(employer({ id: 'b', fromDate: new Date(2023, 8, 1).getTime() }));

  it('prefers employerId for a non-contribution transaction', () => {
    const interestTxn: EpfTransaction = { id: 'i1', type: 'interest', date: Date.now(), amount: 100, employerId: 'b' };
    expect(epfResolveTxnEmployer(interestTxn, [empA, empB])).toBe(empB);
  });

  it('falls back to raw-date containment for a legacy interest/transfer_in txn with no employerId', () => {
    const legacyInterest: EpfTransaction = {
      id: 'i2',
      type: 'interest',
      date: new Date(2023, 5, 1).getTime(),
      amount: 50
    };
    expect(epfResolveTxnEmployer(legacyInterest, [empA, empB])).toBe(empA);
  });

  it('still returns null for a contribution with no wagesMonth (unchanged behavior)', () => {
    const noMonthTxn: EpfTransaction = { id: 'c1', type: 'contribution', date: Date.now(), employeeAmount: 100 };
    expect(epfResolveTxnEmployer(noMonthTxn, [empA, empB])).toBeNull();
  });
});

describe('buildEpfHikeJourney', () => {
  it('returns just the joining point when there are no hikes at all', () => {
    const emp = employer({ basicSalary: 32000, hikeTimeline: undefined });
    const journey = buildEpfHikeJourney(emp);
    expect(journey).toHaveLength(1);
    expect(journey[0]).toMatchObject({ isJoined: true, basicSalary: 32000, growthPct: null });
  });

  it('returns newest-first, with the joining point last and growth % computed vs. the prior point', () => {
    const emp = employer({
      basicSalary: 32000,
      fromDate: new Date(2013, 3, 1).getTime(),
      hikeTimeline: [
        { fromDate: new Date(2014, 6, 1).getTime(), basicSalary: 38000 },
        { fromDate: new Date(2015, 6, 1).getTime(), basicSalary: 45000 }
      ]
    });
    const journey = buildEpfHikeJourney(emp);
    expect(journey).toHaveLength(3);
    expect(journey.map((p) => p.basicSalary)).toEqual([45000, 38000, 32000]);
    expect(journey[2]).toMatchObject({ isJoined: true, growthPct: null });
    expect(journey[1]?.growthPct).toBeCloseTo(((38000 - 32000) / 32000) * 100);
    expect(journey[0]?.growthPct).toBeCloseTo(((45000 - 38000) / 38000) * 100);
  });

  it('sorts an out-of-order hikeTimeline before computing growth (never trusts caller ordering)', () => {
    const emp = employer({
      basicSalary: 30000,
      hikeTimeline: [
        { fromDate: new Date(2016, 0, 1).getTime(), basicSalary: 50000 },
        { fromDate: new Date(2015, 0, 1).getTime(), basicSalary: 40000 }
      ]
    });
    const journey = buildEpfHikeJourney(emp);
    expect(journey.map((p) => p.basicSalary)).toEqual([50000, 40000, 30000]);
  });
});

// Real bug this covers (2026-08-30): an employer re-imported across several yearly passbooks never had
// its `basicSalary`/`hikeTimeline` re-examined for a real wage change already proven by the imported
// data itself — see `findUnrecordedEpfHikes`'s own doc comment.
describe('findUnrecordedEpfHikes', () => {
  // Apr(join, excluded) – Sep(leave, excluded) 2023, per the `employer()` fixture's own default range —
  // May/Jun/Jul/Aug are the usable contribution months for these tests.
  function wageRow(wagesMonth: string, epfWages: number, overrides: Partial<EpfTransaction> = {}): EpfTransaction {
    return contributionTxn({
      id: `t-${wagesMonth}`,
      wagesMonth,
      date: new Date(`${wagesMonth}-15T00:00:00`).getTime(),
      epfWages,
      ...overrides
    });
  }

  it('detects a genuine, sustained wage increase not yet in hikeTimeline', () => {
    const emp = employer({ basicSalary: 40000 });
    const txns = [
      wageRow('2023-05', 40000),
      wageRow('2023-06', 55000),
      wageRow('2023-07', 56000),
      wageRow('2023-08', 56000)
    ];
    const hikes = findUnrecordedEpfHikes(emp, txns);
    expect(hikes).toHaveLength(1);
    expect(hikes[0]).toMatchObject({ wagesMonth: '2023-06', basicSalary: 55000 });
  });

  it('ignores a single-month anomaly that drops back down the very next month', () => {
    const emp = employer({ basicSalary: 40000 });
    const txns = [wageRow('2023-05', 40000), wageRow('2023-06', 60000), wageRow('2023-07', 40000)];
    expect(findUnrecordedEpfHikes(emp, txns)).toHaveLength(0);
  });

  it('never flags the employer’s own joining or leaving wage month, however low', () => {
    const emp = employer({ basicSalary: 40000 }); // fromDate Apr 2023, toDate Sep 2023
    const txns = [
      wageRow('2023-04', 20000), // joining month — expected pro-rata partial, not a "hike"
      wageRow('2023-09', 20000) // leaving month — same
    ];
    expect(findUnrecordedEpfHikes(emp, txns)).toHaveLength(0);
  });

  it('does not re-detect a hike already recorded in hikeTimeline', () => {
    const emp = employer({
      basicSalary: 40000,
      hikeTimeline: [{ fromDate: new Date(2023, 5, 1).getTime(), basicSalary: 55000 }]
    });
    const txns = [wageRow('2023-05', 40000), wageRow('2023-06', 55000), wageRow('2023-07', 55000)];
    expect(findUnrecordedEpfHikes(emp, txns)).toHaveLength(0);
  });

  it('detects two separate sustained raises in the same employer’s history, oldest first', () => {
    const longEmployer = employer({
      basicSalary: 30000,
      fromDate: new Date(2020, 3, 1).getTime(), // Apr 2020
      toDate: new Date(2023, 8, 30).getTime() // Sep 2023
    });
    const txns = [
      wageRow('2020-05', 30000),
      wageRow('2021-04', 45000),
      wageRow('2021-05', 45000),
      wageRow('2023-01', 70000),
      wageRow('2023-02', 70000)
    ];
    const hikes = findUnrecordedEpfHikes(longEmployer, txns);
    expect(hikes.map((h) => h.wagesMonth)).toEqual(['2021-04', '2023-01']);
  });

  it('ignores rows with no real epfWages recorded (never fabricates a hike from partial data)', () => {
    const emp = employer({ basicSalary: 40000 });
    const txns = [wageRow('2023-05', 40000), contributionTxn({ id: 't-2023-06', wagesMonth: '2023-06' })];
    expect(findUnrecordedEpfHikes(emp, txns)).toHaveLength(0);
  });
});

describe('epfExperienceLabel', () => {
  it('formats a full year/month/day breakdown', () => {
    expect(epfExperienceLabel(new Date(2014, 10, 1).getTime(), new Date(2016, 1, 25).getTime())).toBe(
      '1 year, 3 months, 24 days'
    );
  });

  it('omits zero-value components entirely', () => {
    expect(epfExperienceLabel(new Date(2020, 0, 1).getTime(), new Date(2022, 0, 1).getTime())).toBe('2 years');
  });

  it('always shows at least "0 days" for a same-day range', () => {
    const d = new Date(2024, 5, 1).getTime();
    expect(epfExperienceLabel(d, d)).toBe('0 days');
  });

  it('clamps rather than showing a negative day count for a short-February edge case', () => {
    // 31 Jan -> 1 Mar: borrowing Feb's own 28 days still leaves a negative remainder (Jan has 31) —
    // clamped to 0 rather than showing something nonsensical; "1 month" is still a reasonable answer
    // for this genuinely ambiguous calendar-arithmetic edge case (day-of-month overflow past a short
    // month), not a bug to chase further.
    expect(epfExperienceLabel(new Date(2023, 0, 31).getTime(), new Date(2023, 2, 1).getTime())).toBe('1 month');
  });
});

describe('epfEmployerTotals', () => {
  it('sums contribution totals scoped to ONE employer, matching epfComputeAllMonths', () => {
    const empA = employer({ id: 'a', basicSalary: 30000 });
    const empB = employer({
      id: 'b',
      basicSalary: 40000,
      fromDate: new Date(2023, 9, 1).getTime(),
      toDate: new Date(2024, 2, 31).getTime()
    });
    const totals = epfEmployerTotals(empA, [empA, empB], []);
    const allMonthsA = epfComputeAllMonths([empA], []);
    expect(totals.employeeTotal).toBe(allMonthsA.reduce((s, m) => s + m.empAmount, 0));
    expect(totals.employerTotal).toBe(allMonthsA.reduce((s, m) => s + m.eplrEpfAmount, 0));
    expect(totals.pensionTotal).toBe(allMonthsA.reduce((s, m) => s + m.epsAmount, 0));
  });

  it('sums real interest transactions scoped to this employer only, preferring the real split', () => {
    const emp = employer({ id: 'a' });
    const other = employer({ id: 'b', fromDate: new Date(2024, 0, 1).getTime() });
    const txns: EpfTransaction[] = [
      {
        id: 'i1',
        type: 'interest',
        employerId: 'a',
        date: new Date(2023, 8, 30).getTime(),
        employeeAmount: 400,
        employerAmount: 120
      },
      { id: 'i2', type: 'interest', employerId: 'a', date: new Date(2023, 8, 30).getTime(), amount: 90 },
      { id: 'i3', type: 'interest', employerId: 'b', date: new Date(2024, 8, 30).getTime(), amount: 999 }
    ];
    const totals = epfEmployerTotals(emp, [emp, other], txns);
    expect(totals.interestEarned).toBe(400 + 120 + 90);
  });
});
