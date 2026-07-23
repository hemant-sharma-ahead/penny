import { describe, it, expect } from 'vitest';
import {
  applyMfFields,
  applyStockFields,
  applyFdFields,
  applyGoldFields,
  applyPpfFields,
  applyPropertyFields,
  applyNpsFields,
  applyEpfFields
} from '@/core/portfolio/holdingMappers';
import { applyVehicleFields, rcDetailsFromMeta } from '@/core/portfolio/vehicleMeta';
import type { AssetClass, Holding } from '@/core/db/types';
import type { FdResult, RdResult } from '@/core/fd/fdCalculations';

function baseHolding(assetClass: AssetClass = 'mf'): Holding {
  const now = 1_700_000_000_000;
  return {
    id: 'h1',
    assetClass,
    name: 'Test Fund',
    investedAmount: 0,
    lastUpdatedAt: now,
    createdAt: now,
    updatedAt: now
  };
}

describe('applyMfFields', () => {
  it('computes invested amount from units × avg NAV', () => {
    const h = applyMfFields(baseHolding(), {
      schemeCode: '120503',
      units: '100',
      avgCostPrice: '50',
      fetchedPrice: null,
      schemeDetail: null
    });
    expect(h.schemeCode).toBe('120503');
    expect(h.units).toBe(100);
    expect(h.avgCostPrice).toBe(50);
    expect(h.investedAmount).toBe(5000);
    expect(h.currentPrice).toBeUndefined();
    expect(h.currentValue).toBeUndefined();
  });

  it('derives currentPrice/currentValue from the live NAV when present', () => {
    const h = applyMfFields(baseHolding(), {
      schemeCode: '120503',
      units: '10',
      avgCostPrice: '100',
      fetchedPrice: 150,
      schemeDetail: null
    });
    expect(h.currentPrice).toBe(150);
    expect(h.currentValue).toBe(1500);
  });

  it('does not set currentValue when units are absent even if a NAV is known', () => {
    const h = applyMfFields(baseHolding(), {
      schemeCode: '120503',
      units: '',
      avgCostPrice: '',
      fetchedPrice: 150,
      schemeDetail: null
    });
    expect(h.currentPrice).toBe(150);
    expect(h.currentValue).toBeUndefined();
    expect(h.investedAmount).toBe(0);
  });

  it('writes scheme detail into assetMeta', () => {
    const h = applyMfFields(baseHolding(), {
      schemeCode: '120503',
      units: '1',
      avgCostPrice: '1',
      fetchedPrice: null,
      schemeDetail: { fundHouse: 'PPFAS', schemeCategory: 'Flexi Cap', schemeType: 'Open Ended' }
    });
    expect(h.assetMeta?.mfFundHouse).toBe('PPFAS');
    expect(h.assetMeta?.mfSchemeCategory).toBe('Flexi Cap');
    expect(h.assetMeta?.mfSchemeType).toBe('Open Ended');
  });

  it('trims a blank scheme code to undefined', () => {
    const h = applyMfFields(baseHolding(), {
      schemeCode: '   ',
      units: '1',
      avgCostPrice: '1',
      fetchedPrice: null,
      schemeDetail: null
    });
    expect(h.schemeCode).toBeUndefined();
  });
});

describe('applyStockFields', () => {
  it('upper-cases the symbol and computes invested from shares × avg price', () => {
    const h = applyStockFields(baseHolding('stock'), {
      symbol: 'reliance',
      units: '10',
      avgCostPrice: '2500',
      fetchedPrice: null
    });
    expect(h.symbol).toBe('RELIANCE');
    expect(h.units).toBe(10);
    expect(h.avgCostPrice).toBe(2500);
    expect(h.investedAmount).toBe(25000);
  });

  it('derives currentPrice/currentValue from the live price', () => {
    const h = applyStockFields(baseHolding('stock'), {
      symbol: 'INFY',
      units: '5',
      avgCostPrice: '1000',
      fetchedPrice: 1800
    });
    expect(h.currentPrice).toBe(1800);
    expect(h.currentValue).toBe(9000);
  });

  it('leaves symbol undefined when blank', () => {
    const h = applyStockFields(baseHolding('stock'), {
      symbol: '  ',
      units: '',
      avgCostPrice: '',
      fetchedPrice: 1800
    });
    expect(h.symbol).toBeUndefined();
    expect(h.currentValue).toBeUndefined();
    expect(h.investedAmount).toBe(0);
  });
});

describe('applyFdFields', () => {
  const fdPreview: FdResult = {
    maturityAmount: 110000,
    totalInterest: 10000,
    accruedAmount: 105000,
    accruedInterest: 5000,
    daysRemaining: 200,
    pctElapsed: 50,
    isMatured: false
  };

  it('stores FD metadata and snapshots currentValue from the accrued amount', () => {
    const h = applyFdFields(baseHolding('fd'), {
      interestRate: '7.1',
      fdSubType: 'fd',
      fdBank: 'SBI',
      fdStartDate: '2024-01-01',
      maturityDate: '2026-01-01',
      fdCompoundingFreq: 'quarterly',
      rdTenureMonths: '',
      investedAmount: '100000',
      fdPreview
    });
    expect(h.interestRate).toBe(7.1);
    expect(h.assetMeta?.fdSubType).toBe('fd');
    expect(h.assetMeta?.fdBank).toBe('SBI');
    expect(h.assetMeta?.fdCompoundingFreq).toBe('quarterly');
    expect(h.maturityDate).toBe(new Date('2026-01-01').getTime());
    expect(h.currentValue).toBe(105000); // not matured → accruedAmount
  });

  it('uses maturityAmount for a matured FD', () => {
    const h = applyFdFields(baseHolding('fd'), {
      interestRate: '7',
      fdSubType: 'fd',
      fdBank: '',
      fdStartDate: '2020-01-01',
      maturityDate: '2023-01-01',
      fdCompoundingFreq: 'yearly',
      rdTenureMonths: '',
      investedAmount: '100000',
      fdPreview: { ...fdPreview, isMatured: true }
    });
    expect(h.currentValue).toBe(110000);
  });

  it('converts RD installment to total committed and auto-computes maturity', () => {
    const rdPreview: RdResult = {
      maturityAmount: 130000,
      totalInterest: 10000,
      totalDeposited: 60000,
      monthsCompleted: 12,
      monthsRemaining: 12,
      pctElapsed: 50,
      isMatured: false
    };
    const h = applyFdFields(baseHolding('fd'), {
      interestRate: '6.5',
      fdSubType: 'rd',
      fdBank: 'Post Office',
      fdStartDate: '2024-01-01',
      maturityDate: '',
      fdCompoundingFreq: 'quarterly',
      rdTenureMonths: '24',
      investedAmount: '5000', // monthly installment
      fdPreview: rdPreview
    });
    expect(h.assetMeta?.rdTenureMonths).toBe(24);
    expect(h.assetMeta?.rdMonthlyInstallment).toBe(5000);
    expect(h.investedAmount).toBe(120000); // 5000 × 24
    expect(h.maturityDate).toBeTypeOf('number'); // auto-computed
    expect(h.currentValue).toBe(60000); // RD → totalDeposited
  });
});

describe('applyGoldFields', () => {
  it('stores gold with karat and computes invested = weight × price', () => {
    const h = applyGoldFields(baseHolding('gold'), {
      metalType: 'gold',
      metalCategory: 'coin',
      metalKarat: 22,
      metalPurity: '999',
      metalWeightGrams: '10',
      metalPurchasePrice: '6000'
    });
    expect(h.units).toBe(10);
    expect(h.avgCostPrice).toBe(6000);
    expect(h.investedAmount).toBe(60000);
    expect(h.assetMeta?.metalKarat).toBe(22);
    expect(h.assetMeta?.metalPurity).toBeUndefined();
  });

  it('stores silver with purity and drops karat', () => {
    const h = applyGoldFields(baseHolding('gold'), {
      metalType: 'silver',
      metalCategory: 'bar',
      metalKarat: 22,
      metalPurity: '925',
      metalWeightGrams: '100',
      metalPurchasePrice: '80',
      existingMeta: { metalKarat: 24 }
    });
    expect(h.assetMeta?.metalPurity).toBe('925');
    expect(h.assetMeta?.metalKarat).toBeUndefined();
  });
});

describe('applyPpfFields', () => {
  it('stores opening date, bank and annual contribution', () => {
    const h = applyPpfFields(baseHolding('ppf'), {
      ppfOpeningDate: '2020-04-01',
      ppfBank: 'SBI',
      ppfAnnual: '150000'
    });
    expect(h.assetMeta?.ppfOpeningDate).toBe(new Date('2020-04-01').getTime());
    expect(h.assetMeta?.ppfBank).toBe('SBI');
    expect(h.assetMeta?.annualContribution).toBe(150000);
  });

  it('preserves existing meta (e.g. transactions) and ignores blank/zero values', () => {
    const h = applyPpfFields(baseHolding('ppf'), {
      ppfOpeningDate: '',
      ppfBank: '   ',
      ppfAnnual: '0',
      existingMeta: { ppfTransactions: [] }
    });
    expect(h.assetMeta?.ppfTransactions).toEqual([]);
    expect(h.assetMeta?.ppfBank).toBeUndefined();
    expect(h.assetMeta?.annualContribution).toBeUndefined();
  });
});

describe('applyPropertyFields', () => {
  it('stores type, area and city', () => {
    const h = applyPropertyFields(baseHolding('property'), {
      propertyType: 'flat',
      propertyAreaSqft: '1200',
      propertyCity: 'Bangalore'
    });
    expect(h.assetMeta?.propertyType).toBe('flat');
    expect(h.assetMeta?.propertyAreaSqft).toBe(1200);
    expect(h.assetMeta?.propertyCity).toBe('Bangalore');
  });

  it('omits blank type and non-positive area', () => {
    const h = applyPropertyFields(baseHolding('property'), {
      propertyType: '',
      propertyAreaSqft: '0',
      propertyCity: '  '
    });
    expect(h.assetMeta?.propertyType).toBeUndefined();
    expect(h.assetMeta?.propertyAreaSqft).toBeUndefined();
    expect(h.assetMeta?.propertyCity).toBeUndefined();
  });
});

describe('applyNpsFields', () => {
  const common = {
    npsTier: 'tier1' as const,
    npsPran: '123456789012',
    npsMonthly: '5000',
    npsBirthYear: '1985',
    npsLifecycleFund: 'lc50' as const,
    npsPfm: '' as const,
    npsSchemeType: '' as const,
    units: ''
  };

  it('auto choice stores the lifecycle fund and resolves the PFM label', () => {
    const h = applyNpsFields(baseHolding('nps'), {
      ...common,
      npsChoiceType: 'auto',
      npsPfm: 'sbi'
    });
    expect(h.assetMeta?.tier).toBe('tier1');
    expect(h.assetMeta?.npsChoiceType).toBe('auto');
    expect(h.assetMeta?.npsLifecycleFund).toBe('lc50');
    expect(h.assetMeta?.pran).toBe('123456789012');
    expect(h.assetMeta?.monthlyContribution).toBe(5000);
    expect(h.assetMeta?.npsBirthYear).toBe(1985);
    expect(h.assetMeta?.npsPfm).toBe('sbi');
    expect(h.assetMeta?.fundManager).toBeTruthy(); // resolved from NPS_FUND_MANAGERS
  });

  it('active choice stores scheme type and units, not a lifecycle fund', () => {
    const h = applyNpsFields(baseHolding('nps'), {
      ...common,
      npsChoiceType: 'active',
      npsPfm: 'hdfc',
      npsSchemeType: 'E',
      units: '120.5'
    });
    expect(h.assetMeta?.npsSchemeType).toBe('E');
    expect(h.assetMeta?.npsLifecycleFund).toBeUndefined();
    expect(h.units).toBe(120.5);
  });

  it('rejects out-of-range birth years', () => {
    const h = applyNpsFields(baseHolding('nps'), {
      ...common,
      npsChoiceType: 'auto',
      npsBirthYear: '1900'
    });
    expect(h.assetMeta?.npsBirthYear).toBeUndefined();
  });
});

describe('applyEpfFields', () => {
  const common = {
    epfUan: '123456789012',
    epfBirthYear: '1990',
    epfCompany: 'Infosys',
    epfBasicSalary: '60000',
    epfEmployeePct: 12,
    epfJoiningDate: '2022-01-01'
  };

  it('upserts the current employer (no toDate) into existing history', () => {
    const h = applyEpfFields(baseHolding('epf'), {
      ...common,
      existingMeta: {
        epfEmployers: [
          { id: 'old', companyName: 'TCS', basicSalary: 40000, employeeContribPct: 12, fromDate: 1, toDate: 2 },
          { id: 'cur', companyName: 'Infosys', basicSalary: 50000, employeeContribPct: 12, fromDate: 3 }
        ]
      }
    });
    expect(h.assetMeta?.epfEmployers).toHaveLength(2);
    const current = h.assetMeta?.epfEmployers?.find((e) => !e.toDate);
    expect(current?.id).toBe('cur'); // reused, not duplicated
    expect(current?.basicSalary).toBe(60000); // updated
    expect(h.assetMeta?.uan).toBe('123456789012');
  });

  it('computes corpus from transaction history', () => {
    const h = applyEpfFields(baseHolding('epf'), {
      ...common,
      existingMeta: {
        epfTransactions: [
          { id: 't1', type: 'contribution', date: 1, employeeAmount: 5000, employerAmount: 4000 },
          { id: 't2', type: 'interest', date: 2, amount: 1000 },
          { id: 't3', type: 'withdrawal', date: 3, amount: 2000 }
        ]
      }
    });
    expect(h.investedAmount).toBe(8000); // 9000 + 1000 - 2000
  });

  it('never goes negative on a net-withdrawal history', () => {
    const h = applyEpfFields(baseHolding('epf'), {
      ...common,
      existingMeta: { epfTransactions: [{ id: 'w', type: 'withdrawal', date: 1, amount: 5000 }] }
    });
    expect(h.investedAmount).toBe(0);
  });
});

describe('vehicle meta round-trip', () => {
  it('applyVehicleFields then rcDetailsFromMeta preserves the core RC fields', () => {
    const h = applyVehicleFields(baseHolding('vehicle'), {
      vehicleRegInput: 'mh12ab1234',
      challanSnapshot: null,
      rcSnapshot: {
        regNumber: 'MH12AB1234',
        make: 'Honda',
        model: 'City',
        manufactureMonthYear: '',
        year: 2020,
        fuelType: 'Petrol',
        color: 'White',
        vehicleType: 'LMV',
        bodyType: '',
        rtoLocation: 'Pune',
        rcStatus: 'ACTIVE',
        regDate: '',
        engineNo: '',
        chassisNo: '',
        rcValidUpto: 111,
        fitnessUpto: null,
        insuranceCompany: 'ICICI',
        insurancePolicyNo: '',
        insuranceUpto: 222,
        puccNo: '',
        puccUpto: 333,
        salePriceRaw: null,
        fetchedAt: 999,
        ownerName: '',
        presentAddress: '',
        permanentAddress: '',
        financer: '',
        cubicCap: '',
        seatCap: '',
        unladenWeight: '',
        grossWeight: '',
        norms: ''
      }
    });
    expect(h.assetMeta?.vehicleRegNumber).toBe('MH12AB1234');
    expect(h.assetMeta?.vehicleMake).toBe('Honda');

    const rc = rcDetailsFromMeta(h.assetMeta);
    expect(rc?.regNumber).toBe('MH12AB1234');
    expect(rc?.make).toBe('Honda');
    expect(rc?.year).toBe(2020);
    expect(rc?.insuranceUpto).toBe(222);
    expect(rc?.fetchedAt).toBe(999);
  });

  it('stores only the upper-cased reg number when no RC was fetched', () => {
    const h = applyVehicleFields(baseHolding('vehicle'), {
      vehicleRegInput: ' ka01cd5678 ',
      rcSnapshot: null,
      challanSnapshot: null
    });
    expect(h.assetMeta?.vehicleRegNumber).toBe('KA01CD5678');
    expect(rcDetailsFromMeta({})).toBeNull();
  });
});
