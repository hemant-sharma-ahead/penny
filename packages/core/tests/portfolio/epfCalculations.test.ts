import { describe, expect, it } from 'vitest';
import {
  epfComputeAllMonths,
  epfBuildCardData,
  epfCheckWageDiscrepancy,
  epfEmployersCoveringMonth,
  epfEmployerForWagesMonth
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
