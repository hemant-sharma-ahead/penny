import { describe, expect, it } from 'vitest';
import { calcFire } from '@/core/calculators/fire';
import { calcHraExemption } from '@/core/calculators/hra';
import { calcSipSwp } from '@/core/calculators/sipSwp';
import { compareTaxRegimes } from '@/core/calculators/taxRegime';
import { calcFd, calcRd } from '@/core/calculators/fdRd';
import { calcLumpsumFv, calcCagr } from '@/core/calculators/lumpsum';
import { calcCapitalGains } from '@/core/calculators/capitalGains';
import { calcGratuity, GRATUITY_TAX_FREE_CAP } from '@/core/calculators/gratuity';
import { calcSsy, SSY_MATURITY_YEARS } from '@/core/calculators/ssy';
import { calcInflation } from '@/core/calculators/inflation';
import { calcRetirementProjection, calcInvestableCorpus } from '@/core/calculators/retirementProjection';
import type { Holding } from '@/core/db/types';

describe('calcFire', () => {
  it('computes the FIRE number from the safe withdrawal rate', () => {
    const res = calcFire({
      currentAge: 30,
      monthlyExpenses: 50_000,
      currentCorpus: 0,
      monthlyInvestment: 50_000,
      expectedReturnPct: 12,
      inflationPct: 6,
      swrPct: 4
    });
    expect(res).not.toBeNull();
    // 50k × 12 / 0.04 = 1.5 Cr in today's money
    expect(res?.fireNumber).toBeCloseTo(1_50_00_000, 0);
  });

  it('reports FI immediately when corpus already exceeds the target', () => {
    const res = calcFire({
      currentAge: 45,
      monthlyExpenses: 40_000,
      currentCorpus: 5_00_00_000,
      monthlyInvestment: 0,
      expectedReturnPct: 10,
      inflationPct: 6,
      swrPct: 4
    });
    expect(res?.yearsToFi).toBe(0);
    expect(res?.fiAge).toBe(45);
  });

  it('rejects invalid input', () => {
    expect(
      calcFire({
        currentAge: 30,
        monthlyExpenses: 0,
        currentCorpus: 0,
        monthlyInvestment: 1,
        expectedReturnPct: 10,
        inflationPct: 6,
        swrPct: 4
      })
    ).toBeNull();
    expect(
      calcFire({
        currentAge: 30,
        monthlyExpenses: 1000,
        currentCorpus: 0,
        monthlyInvestment: 1,
        expectedReturnPct: 10,
        inflationPct: 6,
        swrPct: 0
      })
    ).toBeNull();
  });
});

describe('calcHraExemption', () => {
  it('takes the least of the three statutory amounts (metro)', () => {
    // Basic 6L, HRA 3L, rent 3.6L, metro.
    // rule1 = 3,00,000; rule2 = 3,00,000 (50% of 6L); rule3 = 3,60,000 − 60,000 = 3,00,000
    const res = calcHraExemption({ basicSalary: 6_00_000, hraReceived: 3_00_000, rentPaid: 3_60_000, isMetro: true });
    expect(res?.exemption).toBeCloseTo(3_00_000, 0);
    expect(res?.taxableHra).toBeCloseTo(0, 0);
  });

  it('limits exemption when rent is low', () => {
    // rent 1.2L, basic 6L → rule3 = 1,20,000 − 60,000 = 60,000 is the least
    const res = calcHraExemption({ basicSalary: 6_00_000, hraReceived: 3_00_000, rentPaid: 1_20_000, isMetro: true });
    expect(res?.exemption).toBeCloseTo(60_000, 0);
    expect(res?.taxableHra).toBeCloseTo(2_40_000, 0);
  });

  it('uses 40% for non-metro', () => {
    const res = calcHraExemption({ basicSalary: 6_00_000, hraReceived: 5_00_000, rentPaid: 6_00_000, isMetro: false });
    expect(res?.percentOfBasic).toBeCloseTo(2_40_000, 0);
  });
});

describe('calcSipSwp', () => {
  const baseSip = {
    monthlyInvestment: 10_000,
    annualStepUpPct: 0,
    accumulationReturnPct: 12,
    accumulationYears: 1,
    monthlyWithdrawal: 0,
    annualWithdrawalIncreasePct: 0,
    withdrawalReturnPct: 0,
    withdrawalYears: 0
  };

  it('compounds a flat SIP as an ordinary annuity', () => {
    // 10k/month, 1 year, 12% p.a. → 10000 × ((1.01^12 − 1) / 0.01) ≈ 1,26,825
    const res = calcSipSwp(baseSip);
    expect(res?.corpusAtRetirement).toBeCloseTo(1_26_825, -1);
    expect(res?.totalInvested).toBe(1_20_000);
    expect(res?.hasSwp).toBe(false);
    expect(res?.corpusAtEnd).toBeCloseTo(res?.corpusAtRetirement ?? 0, 5);
  });

  it('raises the instalment each year when stepping up', () => {
    const res = calcSipSwp({ ...baseSip, annualStepUpPct: 10, accumulationYears: 5 });
    // After 4 boundaries: 10000 × 1.1^4 ≈ 14,641
    expect(res?.finalMonthlySip).toBeCloseTo(14_641, -1);
  });

  it('lets a large corpus survive a modest SWP', () => {
    const res = calcSipSwp({
      monthlyInvestment: 50_000,
      annualStepUpPct: 10,
      accumulationReturnPct: 12,
      accumulationYears: 25,
      monthlyWithdrawal: 50_000,
      annualWithdrawalIncreasePct: 6,
      withdrawalReturnPct: 8,
      withdrawalYears: 25
    });
    expect(res?.hasSwp).toBe(true);
    expect(res?.corpusDepleted).toBe(false);
    expect(res?.monthsCorpusLasted).toBeNull();
    expect(res?.corpusAtEnd ?? 0).toBeGreaterThan(0);
    // Growth identity: withdrawn + remaining − starting corpus = growth during SWP
    expect(res?.withdrawalGains).toBeCloseTo(
      (res?.totalWithdrawn ?? 0) + (res?.corpusAtEnd ?? 0) - (res?.corpusAtRetirement ?? 0),
      0
    );
  });

  it('flags depletion when withdrawals outpace the corpus', () => {
    const res = calcSipSwp({
      monthlyInvestment: 5_000,
      annualStepUpPct: 0,
      accumulationReturnPct: 10,
      accumulationYears: 5,
      monthlyWithdrawal: 1_00_000,
      annualWithdrawalIncreasePct: 6,
      withdrawalReturnPct: 8,
      withdrawalYears: 30
    });
    expect(res?.corpusDepleted).toBe(true);
    expect(res?.monthsCorpusLasted).not.toBeNull();
    expect(res?.corpusAtEnd).toBe(0);
  });

  it('rejects invalid input', () => {
    expect(calcSipSwp({ ...baseSip, monthlyInvestment: 0 })).toBeNull();
    expect(calcSipSwp({ ...baseSip, accumulationYears: 0 })).toBeNull();
  });
});

describe('compareTaxRegimes', () => {
  it('makes ₹12L income tax-free under the new regime (rebate)', () => {
    const res = compareTaxRegimes({
      grossIncome: 12_75_000, // 12L taxable after 75k standard deduction
      isSalaried: true,
      deduction80C: 0,
      deduction80D: 0,
      homeLoanInterest: 0,
      nps80ccd1b: 0,
      hraExemption: 0,
      otherDeductions: 0
    });
    expect(res?.new.taxableIncome).toBeCloseTo(12_00_000, 0);
    expect(res?.new.totalTax).toBeCloseTo(0, 0);
    expect(res?.recommended).toBe('new');
  });

  it('favours the old regime when deductions are large', () => {
    const res = compareTaxRegimes({
      grossIncome: 15_00_000,
      isSalaried: true,
      deduction80C: 1_50_000,
      deduction80D: 25_000,
      homeLoanInterest: 2_00_000,
      nps80ccd1b: 50_000,
      hraExemption: 2_00_000,
      otherDeductions: 0
    });
    expect(res).not.toBeNull();
    expect(res?.old.totalTax ?? 0).toBeLessThan(res?.new.totalTax ?? Infinity);
    expect(res?.recommended).toBe('old');
  });

  it('caps 80C at ₹1.5L', () => {
    const res = compareTaxRegimes({
      grossIncome: 20_00_000,
      isSalaried: true,
      deduction80C: 5_00_000, // over the cap
      deduction80D: 0,
      homeLoanInterest: 0,
      nps80ccd1b: 0,
      hraExemption: 0,
      otherDeductions: 0
    });
    // old taxable = 20L − 50k std − 1.5L (capped) = 18,00,000
    expect(res?.old.taxableIncome).toBeCloseTo(18_00_000, 0);
  });
});

describe('calcFd', () => {
  it('compounds quarterly to maturity', () => {
    // ₹1L at 7% quarterly for 5 years → 1,00,000 × (1 + 0.07/4)^(4×5) ≈ 1,41,478
    const res = calcFd({ principal: 1_00_000, ratePct: 7, years: 5, freq: 'quarterly' });
    expect(res?.maturityAmount).toBeCloseTo(1_41_478, -2);
    expect(res?.totalInterest).toBeCloseTo((res?.maturityAmount ?? 0) - 1_00_000, 0);
  });

  it('rejects invalid input', () => {
    expect(calcFd({ principal: 0, ratePct: 7, years: 5, freq: 'quarterly' })).toBeNull();
    expect(calcFd({ principal: 1000, ratePct: 7, years: 0, freq: 'quarterly' })).toBeNull();
  });
});

describe('calcRd', () => {
  it('returns maturity above total deposited for a positive rate', () => {
    const res = calcRd({ monthlyInstallment: 5_000, ratePct: 7, months: 60 });
    expect(res?.totalDeposited).toBe(3_00_000);
    expect(res?.maturityAmount ?? 0).toBeGreaterThan(3_00_000);
    expect(res?.totalInterest).toBeCloseTo((res?.maturityAmount ?? 0) - 3_00_000, 0);
  });
});

describe('calcLumpsumFv / calcCagr', () => {
  it('doubles at ~12% over ~6 years (rule of 72 sanity)', () => {
    const res = calcLumpsumFv({ principal: 1_00_000, ratePct: 12, years: 6 });
    expect(res?.futureValue).toBeCloseTo(1_00_000 * Math.pow(1.12, 6), 0);
    expect(res?.totalGains).toBeCloseTo((res?.futureValue ?? 0) - 1_00_000, 0);
  });

  it('derives CAGR from start and end values', () => {
    // 1L → 2L in 5 years → (2)^(1/5) − 1 ≈ 14.87%
    const res = calcCagr({ initialValue: 1_00_000, finalValue: 2_00_000, years: 5 });
    expect(res?.cagrPct).toBeCloseTo(14.87, 1);
    expect(res?.absoluteReturnPct).toBeCloseTo(100, 5);
  });
});

describe('calcCapitalGains', () => {
  it('applies the ₹1.25L exemption to long-term equity at 12.5% + cess', () => {
    // Gain 2,25,000 → taxable 1,00,000 → tax 12,500 + 4% cess = 13,000
    const res = calcCapitalGains({
      asset: 'equity',
      buyValue: 1_00_000,
      sellValue: 3_25_000,
      holdingMonths: 18,
      slabRatePct: 30
    });
    expect(res?.isLongTerm).toBe(true);
    expect(res?.exemptionApplied).toBe(1_25_000);
    expect(res?.taxableGain).toBeCloseTo(1_00_000, 0);
    expect(res?.tax).toBeCloseTo(13_000, 0);
  });

  it('taxes short-term equity at a flat 20%', () => {
    const res = calcCapitalGains({
      asset: 'equity',
      buyValue: 1_00_000,
      sellValue: 1_50_000,
      holdingMonths: 6,
      slabRatePct: 30
    });
    expect(res?.isLongTerm).toBe(false);
    expect(res?.appliedRatePct).toBe(20);
    expect(res?.baseTax).toBeCloseTo(10_000, 0);
  });

  it('taxes debt at the slab rate regardless of holding period', () => {
    const res = calcCapitalGains({
      asset: 'debt',
      buyValue: 1_00_000,
      sellValue: 1_50_000,
      holdingMonths: 48,
      slabRatePct: 30
    });
    expect(res?.isLongTerm).toBe(false);
    expect(res?.isSlabRate).toBe(true);
    expect(res?.appliedRatePct).toBe(30);
  });

  it('reports a capital loss with no tax', () => {
    const res = calcCapitalGains({
      asset: 'equity',
      buyValue: 2_00_000,
      sellValue: 1_50_000,
      holdingMonths: 18,
      slabRatePct: 30
    });
    expect(res?.gain).toBe(-50_000);
    expect(res?.tax).toBe(0);
  });
});

describe('calcGratuity', () => {
  it('uses the 15/26 formula and rounds part-years over 6 months up', () => {
    // 7y 7m → 8 years; 50,000 × 15/26 × 8 = 2,30,769
    const res = calcGratuity({ lastMonthlySalary: 50_000, serviceYears: 7, serviceMonths: 7 });
    expect(res?.roundedYears).toBe(8);
    expect(res?.gratuity).toBeCloseTo(2_30_769, -1);
    expect(res?.eligible).toBe(true);
  });

  it('caps at the statutory ₹20L ceiling', () => {
    const res = calcGratuity({ lastMonthlySalary: 5_00_000, serviceYears: 30, serviceMonths: 0 });
    expect(res?.isCapped).toBe(true);
    expect(res?.gratuity).toBe(GRATUITY_TAX_FREE_CAP);
  });

  it('flags below-5-year service as ineligible', () => {
    const res = calcGratuity({ lastMonthlySalary: 40_000, serviceYears: 3, serviceMonths: 0 });
    expect(res?.eligible).toBe(false);
  });
});

describe('calcSsy', () => {
  it('builds a 21-year schedule and stops deposits after year 15', () => {
    const res = calcSsy({ annualDeposit: 1_50_000, ratePct: 8.2 });
    expect(res?.schedule).toHaveLength(SSY_MATURITY_YEARS);
    expect(res?.totalDeposited).toBe(1_50_000 * 15);
    expect(res?.schedule[15]?.deposit).toBe(0); // year 16 (index 15) — no deposit
    expect(res?.maturityValue ?? 0).toBeGreaterThan(res?.totalDeposited ?? 0);
  });

  it('flags deposits outside the ₹250–₹1.5L band', () => {
    expect(calcSsy({ annualDeposit: 100, ratePct: 8.2 })?.depositBelowMin).toBe(true);
    expect(calcSsy({ annualDeposit: 2_00_000, ratePct: 8.2 })?.depositAboveMax).toBe(true);
  });
});

describe('calcInflation', () => {
  it('grows future cost and erodes purchasing power symmetrically', () => {
    const res = calcInflation({ currentCost: 1_00_000, inflationPct: 6, years: 10 });
    const factor = Math.pow(1.06, 10);
    expect(res?.futureCost).toBeCloseTo(1_00_000 * factor, 0);
    expect(res?.erodedValue).toBeCloseTo(1_00_000 / factor, 0);
    expect(res?.increase).toBeCloseTo((res?.futureCost ?? 0) - 1_00_000, 0);
  });

  it('rejects invalid input', () => {
    expect(calcInflation({ currentCost: 0, inflationPct: 6, years: 10 })).toBeNull();
  });
});

describe('calcRetirementProjection', () => {
  const nowMs = new Date('2026-01-01').getTime();
  const base = {
    currentAge: 32,
    retirementAge: 50,
    investableCorpusToday: 38_00_000,
    monthlyExpenseToday: 85_000,
    monthlyInvestment: 40_000,
    expectedReturnPct: 12,
    inflationPct: 6,
    swrPct: 4
  };

  it('projects a yearly path to a fixed retirement age, inflation-adjusting the target', () => {
    const res = calcRetirementProjection(base, nowMs);
    expect(res.yearsToRetirement).toBe(18);
    expect(res.yearlyPath).toHaveLength(19);
    expect(res.yearlyPath[0]).toEqual({ year: 2026, age: 32, corpus: base.investableCorpusToday });
    expect(res.yearlyPath[18]?.age).toBe(50);
    const expectedExpense = 85_000 * Math.pow(1.06, 18);
    expect(res.expenseAtRetirement).toBeCloseTo(expectedExpense, 0);
    expect(res.corpusNeeded).toBeCloseTo((expectedExpense * 12) / 0.04, 0);
    expect(res.corpusProjected).toBeGreaterThan(base.investableCorpusToday);
  });

  it('flags an underfunded plan with a positive monthly gap to close', () => {
    const res = calcRetirementProjection({ ...base, monthlyInvestment: 5_000 }, nowMs);
    expect(res.percentFunded).toBeLessThan(100);
    expect(res.monthlyGapToClose).toBeGreaterThan(0);
  });

  it('treats retirementAge <= currentAge as already retired — no projection beyond today', () => {
    const atAge = calcRetirementProjection({ ...base, retirementAge: 32 }, nowMs);
    expect(atAge.yearsToRetirement).toBe(0);
    expect(atAge.yearlyPath).toHaveLength(1);
    expect(atAge.corpusProjected).toBe(base.investableCorpusToday);

    const pastAge = calcRetirementProjection({ ...base, retirementAge: 28 }, nowMs);
    expect(pastAge.yearsToRetirement).toBe(0);
    expect(pastAge.yearlyPath).toHaveLength(1);
  });

  it('guards corpusNeeded <= 0 (zero safe withdrawal rate) without dividing by zero', () => {
    const res = calcRetirementProjection({ ...base, swrPct: 0 }, nowMs);
    expect(res.corpusNeeded).toBe(0);
    expect(res.percentFunded).toBe(0);
    expect(res.monthlyGapToClose).toBe(0);
    expect(Number.isFinite(res.monthlyGapToClose)).toBe(true);
  });

  it('monthlyGapToClose actually closes the gap when plugged back into the same projection', () => {
    const underfunded = { ...base, monthlyInvestment: 10_000 };
    const res = calcRetirementProjection(underfunded, nowMs);
    expect(res.monthlyGapToClose).toBeGreaterThan(0);
    const boosted = calcRetirementProjection(
      { ...underfunded, monthlyInvestment: underfunded.monthlyInvestment + res.monthlyGapToClose },
      nowMs
    );
    expect(boosted.corpusProjected).toBeCloseTo(res.corpusNeeded, -1);
  });
});

describe('calcInvestableCorpus', () => {
  const holdings: Holding[] = [
    {
      id: '1',
      assetClass: 'mf',
      name: 'Fund',
      investedAmount: 1_00_000,
      currentValue: 1_20_000,
      createdAt: 0,
      updatedAt: 0
    },
    { id: '2', assetClass: 'stock', name: 'Stock', investedAmount: 50_000, createdAt: 0, updatedAt: 0 },
    {
      id: '3',
      assetClass: 'property',
      name: 'Flat',
      investedAmount: 50_00_000,
      currentValue: 60_00_000,
      createdAt: 0,
      updatedAt: 0
    },
    { id: '4', assetClass: 'vehicle', name: 'Car', investedAmount: 8_00_000, createdAt: 0, updatedAt: 0 }
  ];

  it('sums only investable asset classes (mf/stock/fd/nps/ppf/epf/gold) plus liquid funds', () => {
    const total = calcInvestableCorpus(holdings, 2_00_000);
    // 1,20,000 (mf, currentValue wins) + 50,000 (stock, no currentValue → investedAmount) + 2,00,000 liquid
    expect(total).toBe(1_20_000 + 50_000 + 2_00_000);
  });

  it('excludes property/vehicle/other — that equity cannot fund a 4%-withdrawal retirement', () => {
    const withRealAssets = calcInvestableCorpus(holdings, 0);
    const withoutRealAssets = calcInvestableCorpus(
      holdings.filter((h) => h.assetClass !== 'property' && h.assetClass !== 'vehicle'),
      0
    );
    expect(withRealAssets).toBe(withoutRealAssets);
  });
});
