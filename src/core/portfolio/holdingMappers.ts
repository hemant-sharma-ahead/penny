// Pure mappers that apply asset-class-specific fields to a base Holding.
// Extracted from HoldingForm.handleSave so the save logic is unit-testable
// without rendering the form. Each mapper mirrors its original branch exactly.
import type { AssetClass, AssetMeta, EpfEmployer, Holding } from '@/core/db/types';
import type { CompoundingFreq, FdResult, RdResult } from '@/core/fd/fdCalculations';
import { NPS_FUND_MANAGERS } from '@/core/nps';
import type { NpsChoiceType, NpsLifecycleFund, NpsPfmKey, NpsSchemeType } from '@/core/nps';
import type { MfSchemeDetail } from './mfApiClient';

export interface MfFieldsInput {
  schemeCode: string;
  units: string;
  avgCostPrice: string;
  fetchedPrice: number | null;
  schemeDetail: MfSchemeDetail | null;
}

// Applies mutual-fund fields: invested = units × avg NAV, live NAV →
// currentPrice/currentValue, scheme detail → assetMeta.
export function applyMfFields(holding: Holding, input: MfFieldsInput): Holding {
  const parsedUnits = parseFloat(input.units) || undefined;
  const parsedAvgCost = parseFloat(input.avgCostPrice) || undefined;

  const sc = input.schemeCode.trim();
  if (sc) holding.schemeCode = sc;
  if (parsedUnits !== undefined) holding.units = parsedUnits;
  if (parsedAvgCost !== undefined) holding.avgCostPrice = parsedAvgCost;
  holding.investedAmount = (parsedUnits ?? 0) * (parsedAvgCost ?? 0);
  if (input.fetchedPrice !== null) {
    holding.currentPrice = input.fetchedPrice;
    if (parsedUnits !== undefined) holding.currentValue = parsedUnits * input.fetchedPrice;
  }
  if (input.schemeDetail) {
    const meta: AssetMeta = {
      ...(holding.assetMeta ?? {}),
      mfFundHouse: input.schemeDetail.fundHouse,
      mfSchemeCategory: input.schemeDetail.schemeCategory,
      mfSchemeType: input.schemeDetail.schemeType
    };
    holding.assetMeta = meta;
  }
  return holding;
}

export interface StockFieldsInput {
  symbol: string;
  units: string;
  avgCostPrice: string;
  fetchedPrice: number | null;
}

// Applies stock fields: symbol is upper-cased, invested = shares × avg buy
// price, live price → currentPrice/currentValue.
export function applyStockFields(holding: Holding, input: StockFieldsInput): Holding {
  const parsedUnits = parseFloat(input.units) || undefined;
  const parsedAvgCost = parseFloat(input.avgCostPrice) || undefined;

  const sym = input.symbol.trim().toUpperCase();
  if (sym) holding.symbol = sym;
  if (parsedUnits !== undefined) holding.units = parsedUnits;
  if (parsedAvgCost !== undefined) holding.avgCostPrice = parsedAvgCost;
  holding.investedAmount = (parsedUnits ?? 0) * (parsedAvgCost ?? 0);
  if (input.fetchedPrice !== null) {
    holding.currentPrice = input.fetchedPrice;
    if (parsedUnits !== undefined) holding.currentValue = parsedUnits * input.fetchedPrice;
  }
  return holding;
}

export interface FdFieldsInput {
  interestRate: string;
  fdSubType: 'fd' | 'rd';
  fdBank: string;
  fdStartDate: string;
  maturityDate: string;
  fdCompoundingFreq: CompoundingFreq;
  rdTenureMonths: string;
  investedAmount: string;
  fdPreview: FdResult | RdResult | null;
  existingMeta?: AssetMeta;
}

// Applies FD/RD fields. For RD the form's "invested amount" is the monthly
// installment, so investedAmount is stored as installment × tenure and the
// maturity date is auto-computed. currentValue is snapshotted from the live
// preview so portfolio totals stay accurate.
export function applyFdFields(holding: Holding, input: FdFieldsInput): Holding {
  const rate = parseFloat(input.interestRate);
  if (!isNaN(rate) && rate > 0) holding.interestRate = rate;

  const meta: AssetMeta = { ...(input.existingMeta ?? {}) };
  meta.fdSubType = input.fdSubType;
  if (input.fdBank.trim()) meta.fdBank = input.fdBank.trim();
  if (input.fdStartDate) meta.fdStartDate = new Date(input.fdStartDate).getTime();

  if (input.fdSubType === 'fd') {
    if (input.maturityDate) holding.maturityDate = new Date(input.maturityDate).getTime();
    meta.fdCompoundingFreq = input.fdCompoundingFreq;
  } else {
    // RD — maturity date auto-computed; investedAmount = monthly installment
    const tenure = parseInt(input.rdTenureMonths, 10);
    if (!isNaN(tenure) && tenure > 0) {
      meta.rdTenureMonths = tenure;
      meta.rdMonthlyInstallment = parseFloat(input.investedAmount) || 0;
      if (input.fdStartDate) {
        const ms = new Date(input.fdStartDate).getTime() + tenure * 30.4375 * 24 * 3600 * 1000;
        holding.maturityDate = Math.round(ms);
      }
    }
    // investedAmount for RD = total committed (installment × tenure)
    const rdInstallment = parseFloat(input.investedAmount) || 0;
    const tenure2 = parseInt(input.rdTenureMonths, 10) || 0;
    holding.investedAmount = rdInstallment * tenure2;
  }

  if (input.fdPreview)
    holding.currentValue = input.fdPreview.isMatured
      ? input.fdPreview.maturityAmount
      : 'accruedAmount' in input.fdPreview
        ? input.fdPreview.accruedAmount
        : input.fdPreview.totalDeposited;
  holding.assetMeta = meta;
  return holding;
}

export interface GoldFieldsInput {
  metalType: 'gold' | 'silver';
  metalCategory: 'jewellery' | 'coin' | 'bar' | 'digital' | 'other';
  metalKarat: 14 | 18 | 22 | 24;
  metalPurity: string;
  metalWeightGrams: string;
  metalPurchasePrice: string;
  existingMeta?: AssetMeta;
}

// Applies precious-metal fields. units = weight in grams, avgCostPrice =
// purchase price per gram, invested = weight × price. Karat applies to gold,
// purity to silver (the unused one is removed from meta).
export function applyGoldFields(holding: Holding, input: GoldFieldsInput): Holding {
  const wt = parseFloat(input.metalWeightGrams) || 0;
  const pp = parseFloat(input.metalPurchasePrice) || 0;
  holding.units = wt;
  holding.avgCostPrice = pp;
  holding.investedAmount = wt * pp;

  const meta: AssetMeta = { ...(input.existingMeta ?? {}) };
  meta.metalType = input.metalType;
  meta.metalCategory = input.metalCategory;
  meta.metalWeightGrams = wt;
  meta.metalPurchasePricePerGram = pp;
  if (input.metalType === 'gold') {
    meta.metalKarat = input.metalKarat;
    delete meta.metalPurity;
  } else {
    meta.metalPurity = input.metalPurity;
    delete meta.metalKarat;
  }
  holding.assetMeta = meta;
  return holding;
}

export interface PpfFieldsInput {
  ppfOpeningDate: string;
  ppfBank: string;
  ppfAnnual: string;
  existingMeta?: AssetMeta;
}

// Applies PPF fields. Corpus/transactions are managed from the PPF card after
// saving, so only the account metadata is set here.
export function applyPpfFields(holding: Holding, input: PpfFieldsInput): Holding {
  const meta: AssetMeta = { ...(input.existingMeta ?? {}) };
  if (input.ppfOpeningDate) meta.ppfOpeningDate = new Date(input.ppfOpeningDate).getTime();
  if (input.ppfBank.trim()) meta.ppfBank = input.ppfBank.trim();
  const annual = parseFloat(input.ppfAnnual);
  if (!isNaN(annual) && annual > 0) meta.annualContribution = annual;
  holding.assetMeta = meta;
  return holding;
}

export type PropertyType = 'flat' | 'house' | 'plot' | 'commercial' | '';

export interface PropertyFieldsInput {
  propertyType: PropertyType;
  propertyAreaSqft: string;
  propertyCity: string;
  existingMeta?: AssetMeta;
}

// Applies property metadata. Invested/current value come from the shared
// amount fields, so only the descriptive metadata is set here.
export function applyPropertyFields(holding: Holding, input: PropertyFieldsInput): Holding {
  const meta: AssetMeta = { ...(input.existingMeta ?? {}) };
  if (input.propertyType) meta.propertyType = input.propertyType;
  const sqft = parseFloat(input.propertyAreaSqft);
  if (!isNaN(sqft) && sqft > 0) meta.propertyAreaSqft = sqft;
  if (input.propertyCity.trim()) meta.propertyCity = input.propertyCity.trim();
  holding.assetMeta = meta;
  return holding;
}

export interface NpsFieldsInput {
  npsTier: 'tier1' | 'tier2';
  npsChoiceType: NpsChoiceType;
  npsPran: string;
  npsMonthly: string;
  npsBirthYear: string;
  npsLifecycleFund: NpsLifecycleFund;
  npsPfm: NpsPfmKey | '';
  npsSchemeType: NpsSchemeType | '';
  units: string;
}

// Applies NPS fields. Auto choice stores the lifecycle fund (+ optional PFM with
// its resolved label); active choice stores PFM, scheme type and units. Birth
// year is range-validated. Builds a fresh assetMeta (no spread of prior meta).
export function applyNpsFields(holding: Holding, input: NpsFieldsInput): Holding {
  const meta: AssetMeta = { tier: input.npsTier, npsChoiceType: input.npsChoiceType };
  if (input.npsPran.trim()) meta.pran = input.npsPran.trim();
  const monthly = parseFloat(input.npsMonthly);
  if (!isNaN(monthly) && monthly > 0) meta.monthlyContribution = monthly;
  const birthYear = parseInt(input.npsBirthYear, 10);
  if (!isNaN(birthYear) && birthYear > 1940 && birthYear < 2010) meta.npsBirthYear = birthYear;

  if (input.npsChoiceType === 'auto') {
    meta.npsLifecycleFund = input.npsLifecycleFund;
    if (input.npsPfm) {
      meta.npsPfm = input.npsPfm;
      meta.fundManager = NPS_FUND_MANAGERS.find((m) => m.key === input.npsPfm)?.label ?? input.npsPfm;
    }
  } else {
    // active choice
    if (input.npsPfm) meta.npsPfm = input.npsPfm;
    if (input.npsSchemeType) meta.npsSchemeType = input.npsSchemeType;
    const parsedUnits = parseFloat(input.units) || undefined;
    if (parsedUnits !== undefined) holding.units = parsedUnits;
  }
  holding.assetMeta = meta;
  return holding;
}

export interface EpfFieldsInput {
  epfUan: string;
  epfBirthYear: string;
  epfCompany: string;
  epfBasicSalary: string;
  epfEmployeePct: number;
  epfJoiningDate: string;
  existingMeta?: AssetMeta;
}

// Applies EPF fields. Upserts the current employer (the one without a toDate)
// into the employer history, and recomputes the corpus (investedAmount) purely
// from transaction history — it is never entered manually.
export function applyEpfFields(holding: Holding, input: EpfFieldsInput): Holding {
  const meta: AssetMeta = { ...(input.existingMeta ?? {}) };
  if (input.epfUan.trim()) meta.uan = input.epfUan.trim();
  const by = parseInt(input.epfBirthYear, 10);
  if (!isNaN(by) && by > 1940 && by < 2010) meta.epfBirthYear = by;

  const existingEmployers: EpfEmployer[] = [...(input.existingMeta?.epfEmployers ?? [])];
  const currentIdx = existingEmployers.findIndex((e) => !e.toDate);
  const basic = parseFloat(input.epfBasicSalary);

  if (input.epfCompany.trim() && !isNaN(basic) && basic > 0) {
    const currentEmp = currentIdx >= 0 ? existingEmployers[currentIdx] : undefined;
    const emp: EpfEmployer = {
      id: currentEmp?.id ?? crypto.randomUUID(),
      companyName: input.epfCompany.trim(),
      basicSalary: basic,
      employeeContribPct: input.epfEmployeePct,
      fromDate: input.epfJoiningDate ? new Date(input.epfJoiningDate).getTime() : Date.now(),
      ...(currentEmp?.hikeTimeline && { hikeTimeline: currentEmp.hikeTimeline })
    };
    if (currentIdx >= 0) {
      existingEmployers[currentIdx] = emp;
    } else {
      existingEmployers.push(emp);
    }
  }

  meta.epfEmployers = existingEmployers;

  // Corpus calculated from transaction history — not entered manually
  const txns = meta.epfTransactions ?? [];
  const calculated = txns.reduce((sum, t) => {
    if (t.type === 'contribution') return sum + (t.employeeAmount ?? 0) + (t.employerAmount ?? 0);
    if (t.type === 'transfer_in' || t.type === 'interest') return sum + (t.amount ?? 0);
    if (t.type === 'withdrawal' || t.type === 'advance') return sum - (t.amount ?? 0);
    return sum;
  }, 0);
  holding.investedAmount = Math.max(0, calculated);
  holding.assetMeta = meta;
  return holding;
}

export interface BaseHoldingInput {
  assetClass: AssetClass;
  name: string; // already-resolved effective name
  investedAmount: number;
  currentValue?: number | undefined;
  notes: string;
}

// Builds the common Holding fields shared by every asset class. Class-specific
// fields are layered on afterwards by the matching applyXFields mapper.
export function buildBaseHolding(input: BaseHoldingInput, editing: Holding | null): Holding {
  const now = Date.now();
  const holding: Holding = {
    id: editing?.id ?? crypto.randomUUID(),
    assetClass: input.assetClass,
    name: input.name,
    investedAmount: input.investedAmount,
    lastUpdatedAt: now,
    createdAt: editing?.createdAt ?? now,
    updatedAt: now
  };
  if (input.currentValue !== undefined) holding.currentValue = input.currentValue;
  const notesVal = input.notes.trim();
  if (notesVal) holding.notes = notesVal;
  return holding;
}

// Shared save-guard: a name is always required; classes that take a manual
// amount also require it to be positive. (Gold's weight/price check and any
// other class-specific guards live in the owning modal.)
export function isHoldingValid(input: { name: string; requiresAmount: boolean; investedAmount: number }): boolean {
  if (!input.name) return false;
  if (input.requiresAmount && (isNaN(input.investedAmount) || input.investedAmount <= 0)) return false;
  return true;
}
