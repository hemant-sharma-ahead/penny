// Indian personal income-tax slab table (2026-08-30) — real reported ask: the EPF hike breakdown's
// "Net Monthly" figure (Gross − employee EPF only) was explicitly labelled "doesn't subtract income
// tax," and the user asked for a real "In Hand Monthly" figure that does — with the slab data itself
// fetched from Cloudflare rather than hardcoded in the app, matching the exact architecture already
// used for EPF/PPF interest rates and the Basic-to-Gross ratio convention
// (`epfBasicToGrossRates.ts`).
//
// Also intended to be reused later by the Tax Footprint screens and a future ITR-import feature (per
// the user's own framing of this request) — kept as a standalone, screen-agnostic rate table +
// calculator, not EPF-specific in its own shape, even though this file's first caller is EPF.
//
// BOTH regimes are modelled, not just one (2026-08-30 fix — a real, direct question caught this: from
// FY2020-21 onward, a taxpayer can choose EITHER regime every year; the first version of this file
// only ever computed the New Regime, silently assuming everyone from FY2020-21 onward was on it).
// `oldRegime` covers every year from FY2014-15 onward (it's the only regime that existed before
// FY2020-21, and it's STILL a valid choice today — its own slabs have simply stayed frozen at their
// FY2019-20 shape ever since, per the real historical record); `newRegime` only has entries from
// FY2020-21 onward (`null` for any earlier month — there was nothing to choose from yet).
//
// Deliberate simplifications, always shown plainly in the UI, never asserted as exact fact (same
// "labelled estimate, never fact" principle as `estimateGrossAndCtc`'s Basic-to-Gross ratio):
//  - The Old Regime figure never models 80C/HRA/home-loan-interest/NPS/etc. deductions — Penny has no
//    data on what a user would actually claim, so this is closer to "Old Regime slabs with zero
//    deductions," a genuine upper bound on what an Old Regime filer would really owe, not their real
//    figure. Always shown side by side with the New Regime figure, never alone, so it reads as "one of
//    two possibilities to compare," not a single asserted truth.
//  - Section 87A's rebate is modelled as a hard cliff (taxable income at/below the threshold ⇒ ZERO
//    tax), which is exactly correct for every threshold from FY2019-20 onward (₹5L/₹7L/₹12L are all
//    genuine full-rebate thresholds) but is a simplification for the pre-2019 Old Regime years, where
//    87A was a smaller capped rebate AMOUNT, not a full exemption up to that income. Real historical
//    slabs are still used regardless — only the very early rebate mechanic is approximated.
//  - No surcharge (only applies well above the income levels this feature's own hike-journey estimates
//    realistically reach), no state-specific professional tax.
import { EPF_INCOME_TAX_RATES_BASE } from '@/core/net/apiBase';
import { getItem, setItem } from './ratesStorage';

export type TaxRegime = 'new' | 'old';

/** One income bracket taxed at `ratePct` — `upToAnnualIncome: null` marks the highest, unbounded
 *  bracket. Brackets within a period must be sorted ascending by `upToAnnualIncome` (nulls last). */
export interface TaxSlabBracket {
  upToAnnualIncome: number | null;
  ratePct: number;
}

/** One financial year's full slab structure for ONE regime — modelled as periods (like
 *  `EpfRatePeriod`) so a slab restructuring (there have been several — see this file's header
 *  comment) needs no special-casing anywhere that consumes this list. */
export interface TaxRegimePeriod {
  /** "YYYY-MM" — the first month (always April, an FY's start) this period's slabs apply from. */
  effectiveFrom: string;
  brackets: TaxSlabBracket[];
  /** Flat deduction from gross income before slabs apply (salaried standard deduction) — 0 for
   *  periods where none existed yet. */
  standardDeduction: number;
  /** Section 87A rebate, modelled as a hard cliff: taxable income (after `standardDeduction`) at or
   *  below this ⇒ total tax is 0. See this file's header comment for the pre-2019 simplification. */
  rebateThresholdIncome: number;
  cessPct: number;
}

export interface EpfIncomeTaxTable {
  /** Empty for any month before FY2020-21 — the New Regime didn't exist yet. */
  newRegime: TaxRegimePeriod[];
  /** Non-empty for every month back to FY2014-15 — the Old Regime is the ONLY regime pre-FY2020-21,
   *  and remains a valid choice today (frozen at its FY2019-20 shape since). */
  oldRegime: TaxRegimePeriod[];
}

const OLD_REGIME_PERIODS: TaxRegimePeriod[] = [
  // FY2014-15 – FY2016-17.
  {
    effectiveFrom: '2014-04',
    brackets: [
      { upToAnnualIncome: 250000, ratePct: 0 },
      { upToAnnualIncome: 500000, ratePct: 10 },
      { upToAnnualIncome: 1000000, ratePct: 20 },
      { upToAnnualIncome: null, ratePct: 30 }
    ],
    standardDeduction: 0,
    rebateThresholdIncome: 0, // 87A existed but only as a small capped rebate amount, not modelled this early
    cessPct: 3
  },
  // FY2017-18: the 2.5L-5L bracket cut from 10% to 5%.
  {
    effectiveFrom: '2017-04',
    brackets: [
      { upToAnnualIncome: 250000, ratePct: 0 },
      { upToAnnualIncome: 500000, ratePct: 5 },
      { upToAnnualIncome: 1000000, ratePct: 20 },
      { upToAnnualIncome: null, ratePct: 30 }
    ],
    standardDeduction: 0,
    rebateThresholdIncome: 350000,
    cessPct: 3
  },
  // FY2018-19: cess raised 3% → 4% ("Health and Education Cess"); standard deduction reintroduced.
  {
    effectiveFrom: '2018-04',
    brackets: [
      { upToAnnualIncome: 250000, ratePct: 0 },
      { upToAnnualIncome: 500000, ratePct: 5 },
      { upToAnnualIncome: 1000000, ratePct: 20 },
      { upToAnnualIncome: null, ratePct: 30 }
    ],
    standardDeduction: 40000,
    rebateThresholdIncome: 350000,
    cessPct: 4
  },
  // FY2019-20 onward: standard deduction raised to 50,000; 87A rebate raised to fully cover tax up to
  // 5L. The Old Regime has stayed FROZEN at exactly this shape ever since (no further periods needed)
  // — every slab change since FY2020-21 has only ever applied to the New Regime.
  {
    effectiveFrom: '2019-04',
    brackets: [
      { upToAnnualIncome: 250000, ratePct: 0 },
      { upToAnnualIncome: 500000, ratePct: 5 },
      { upToAnnualIncome: 1000000, ratePct: 20 },
      { upToAnnualIncome: null, ratePct: 30 }
    ],
    standardDeduction: 50000,
    rebateThresholdIncome: 500000,
    cessPct: 4
  }
];

const NEW_REGIME_PERIODS: TaxRegimePeriod[] = [
  // FY2020-21 – FY2022-23: New Tax Regime introduced (Section 115BAC) — no standard deduction yet
  // under the new regime at this stage.
  {
    effectiveFrom: '2020-04',
    brackets: [
      { upToAnnualIncome: 250000, ratePct: 0 },
      { upToAnnualIncome: 500000, ratePct: 5 },
      { upToAnnualIncome: 750000, ratePct: 10 },
      { upToAnnualIncome: 1000000, ratePct: 15 },
      { upToAnnualIncome: 1250000, ratePct: 20 },
      { upToAnnualIncome: 1500000, ratePct: 25 },
      { upToAnnualIncome: null, ratePct: 30 }
    ],
    standardDeduction: 0,
    rebateThresholdIncome: 500000,
    cessPct: 4
  },
  // FY2023-24 – FY2024-25: New Regime becomes the default; slabs widened; standard deduction
  // extended to the new regime; 87A rebate raised to fully cover tax up to 7L.
  {
    effectiveFrom: '2023-04',
    brackets: [
      { upToAnnualIncome: 300000, ratePct: 0 },
      { upToAnnualIncome: 700000, ratePct: 5 },
      { upToAnnualIncome: 1000000, ratePct: 10 },
      { upToAnnualIncome: 1200000, ratePct: 15 },
      { upToAnnualIncome: 1500000, ratePct: 20 },
      { upToAnnualIncome: null, ratePct: 30 }
    ],
    standardDeduction: 50000,
    rebateThresholdIncome: 700000,
    cessPct: 4
  },
  // FY2025-26 onward: Union Budget 2025 widened slabs further, raised standard deduction to 75,000,
  // and raised the 87A rebate to fully cover tax up to 12L (12.75L inclusive of the standard
  // deduction, for a salaried taxpayer).
  {
    effectiveFrom: '2025-04',
    brackets: [
      { upToAnnualIncome: 400000, ratePct: 0 },
      { upToAnnualIncome: 800000, ratePct: 5 },
      { upToAnnualIncome: 1200000, ratePct: 10 },
      { upToAnnualIncome: 1600000, ratePct: 15 },
      { upToAnnualIncome: 2000000, ratePct: 20 },
      { upToAnnualIncome: 2400000, ratePct: 25 },
      { upToAnnualIncome: null, ratePct: 30 }
    ],
    standardDeduction: 75000,
    rebateThresholdIncome: 1200000,
    cessPct: 4
  }
];

/** Baked-in offline-first fallback and the initial seed for the Worker's own static JSON route.
 *  Sourced from the real historical slab structures (verified against the user's own research during
 *  this feature's design) — kept sorted ascending by `effectiveFrom` within each regime, relied on by
 *  `lookupTaxPeriodForMonth`. */
export const EPF_INCOME_TAX_TABLE_FALLBACK: EpfIncomeTaxTable = {
  newRegime: NEW_REGIME_PERIODS,
  oldRegime: OLD_REGIME_PERIODS
};

const CACHE_KEY = 'penny_epf_income_tax_table_v2';
const REFRESH_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — matches epfInterestRates.ts

let memCache: EpfIncomeTaxTable | null = null;

interface CachedTable {
  table: EpfIncomeTaxTable;
  fetchedAt: number;
}

function isValidPeriodList(value: unknown): value is TaxRegimePeriod[] {
  return (
    Array.isArray(value) &&
    value.every(
      (p): p is TaxRegimePeriod =>
        !!p &&
        typeof p === 'object' &&
        typeof p.effectiveFrom === 'string' &&
        Array.isArray(p.brackets) &&
        typeof p.standardDeduction === 'number' &&
        typeof p.rebateThresholdIncome === 'number' &&
        typeof p.cessPct === 'number'
    )
  );
}

function isValidTable(value: unknown): value is EpfIncomeTaxTable {
  if (!value || typeof value !== 'object') return false;
  const table = value as EpfIncomeTaxTable;
  // `oldRegime` must be non-empty (it's the only regime for the earliest years this table covers);
  // `newRegime` is allowed to be empty in principle, though the real table always has entries too.
  return isValidPeriodList(table.oldRegime) && table.oldRegime.length > 0 && isValidPeriodList(table.newRegime);
}

/** Returns the best table available: a fresh local cache if one exists and isn't stale, otherwise a
 *  live fetch from the Worker (cached locally on success), otherwise — if offline or the Worker is
 *  unreachable — silently falls back to `EPF_INCOME_TAX_TABLE_FALLBACK`. Never throws. */
export async function getEpfIncomeTaxTable(): Promise<EpfIncomeTaxTable> {
  if (memCache) return memCache;

  try {
    const cached = await getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedTable;
      if (isValidTable(parsed.table) && Date.now() - parsed.fetchedAt < REFRESH_INTERVAL_MS) {
        memCache = parsed.table;
        return memCache;
      }
    }
  } catch {
    // corrupt cache — fall through to a live fetch
  }

  if (EPF_INCOME_TAX_RATES_BASE) {
    try {
      const res = await fetch(EPF_INCOME_TAX_RATES_BASE);
      if (res.ok) {
        const json: unknown = await res.json();
        if (isValidTable(json)) {
          memCache = json;
          await setItem(CACHE_KEY, JSON.stringify({ table: json, fetchedAt: Date.now() } satisfies CachedTable));
          return memCache;
        }
      }
    } catch {
      // offline / worker unreachable — fall through to the baked-in table
    }
  }

  memCache = EPF_INCOME_TAX_TABLE_FALLBACK;
  return memCache;
}

/** A genuinely empty-table fallback (all income tax-free) — only ever used if a regime's period list
 *  is somehow empty despite `isValidTable`'s own non-empty check on `oldRegime` (and `newRegime` being
 *  legitimately empty for a pre-FY2020-21 month, handled separately by `isNewRegimeAvailable` below,
 *  not this). Exists purely so `lookupTaxPeriodForMonth` can stay non-optional without an unsafe
 *  non-null assertion. */
const EMPTY_TABLE_PERIOD: TaxRegimePeriod = {
  effectiveFrom: '1900-01',
  brackets: [{ upToAnnualIncome: null, ratePct: 0 }],
  standardDeduction: 0,
  rebateThresholdIncome: Infinity,
  cessPct: 0
};

/** Whether the New Regime existed yet as a choice for a given "YYYY-MM" month — `false` for anything
 *  before FY2020-21, when the Old Regime was the only option. */
export function isNewRegimeAvailable(table: EpfIncomeTaxTable, month: string): boolean {
  return table.newRegime.some((p) => p.effectiveFrom <= month);
}

/** The slab period in effect for a given "YYYY-MM" month under the requested regime — always returns
 *  a real period for `'old'` (falls back to the first one for a month before the table even starts,
 *  same "always some usable default" convention as `epfBasicToGrossRates.ts`'s lookup); for `'new'`
 *  on a month before FY2020-21, there's genuinely nothing to return — callers should check
 *  `isNewRegimeAvailable` first (see `estimateAnnualIncomeTax`, which does exactly that). */
export function lookupTaxPeriodForMonth(table: EpfIncomeTaxTable, month: string, regime: TaxRegime): TaxRegimePeriod {
  const periods = regime === 'new' ? table.newRegime : table.oldRegime;
  let result = periods[0] ?? EMPTY_TABLE_PERIOD;
  for (const p of periods) {
    if (p.effectiveFrom <= month) result = p;
    else break;
  }
  return result;
}

export interface EpfIncomeTaxEstimate {
  taxableIncome: number;
  incomeTax: number;
  cess: number;
  totalTax: number;
}

/** Estimates ANNUAL income tax on an annual gross income for a given "YYYY-MM" month, under the
 *  REQUESTED regime's slabs in effect for that month's FY — see this file's header comment for every
 *  simplification this makes. Never negative; a taxable income at/below the period's rebate threshold
 *  pays zero tax entirely (Section 87A), not just a reduced amount.
 *
 *  Requesting `'new'` for a month before FY2020-21 (when the New Regime didn't exist) silently falls
 *  back to computing the Old Regime instead, rather than returning a nonsensical/empty result — the
 *  UI layer (`EpfEmployerDetailModal.tsx`) is what actually decides whether to show one figure or two
 *  based on `isNewRegimeAvailable`, this function just never fails outright either way. */
export function estimateAnnualIncomeTax(
  annualGrossIncome: number,
  table: EpfIncomeTaxTable,
  month: string,
  regime: TaxRegime
): EpfIncomeTaxEstimate {
  const effectiveRegime = regime === 'new' && !isNewRegimeAvailable(table, month) ? 'old' : regime;
  const period = lookupTaxPeriodForMonth(table, month, effectiveRegime);
  const taxableIncome = Math.max(0, annualGrossIncome - period.standardDeduction);
  if (taxableIncome <= period.rebateThresholdIncome) {
    return { taxableIncome, incomeTax: 0, cess: 0, totalTax: 0 };
  }
  let tax = 0;
  let lowerBound = 0;
  for (const bracket of period.brackets) {
    const upperBound = bracket.upToAnnualIncome ?? Infinity;
    if (taxableIncome <= lowerBound) break;
    const amountInBracket = Math.min(taxableIncome, upperBound) - lowerBound;
    tax += amountInBracket * (bracket.ratePct / 100);
    lowerBound = upperBound;
  }
  const cess = tax * (period.cessPct / 100);
  return {
    taxableIncome,
    incomeTax: Math.round(tax),
    cess: Math.round(cess),
    totalTax: Math.round(tax + cess)
  };
}
