// Indian income-tax slab table (2026-08-30) — see
// `packages/core/src/core/portfolio/epfIncomeTaxRates.ts`'s own doc comment for the full rationale,
// scope, and every simplification this makes (including why BOTH regimes are modelled, not just the
// New Regime — a taxpayer can choose either from FY2020-21 onward). Served as a small, static JSON
// route — same rationale as `/epf-rates`/`/epf-basic-to-gross-rates`.
//
// This is a standalone copy of the same shape the client-side file defines (`TaxSlabBracket`/
// `TaxRegimePeriod`/`EpfIncomeTaxTable`) — `workers/` is deliberately excluded from the pnpm
// workspace (see CLAUDE.md) and doesn't depend on `packages/core`, so the two are kept in sync by
// hand, same convention as `epfRates.ts`/`ppfRates.ts`/`epfBasicToGrossRates.ts`. If you update one,
// update the other.

interface TaxSlabBracket {
  upToAnnualIncome: number | null;
  ratePct: number;
}

interface TaxRegimePeriod {
  effectiveFrom: string; // "YYYY-MM"
  brackets: TaxSlabBracket[];
  standardDeduction: number;
  rebateThresholdIncome: number;
  cessPct: number;
}

interface EpfIncomeTaxTable {
  newRegime: TaxRegimePeriod[];
  oldRegime: TaxRegimePeriod[];
}

export const EPF_INCOME_TAX_TABLE: EpfIncomeTaxTable = {
  oldRegime: [
    {
      effectiveFrom: '2014-04',
      brackets: [
        { upToAnnualIncome: 250000, ratePct: 0 },
        { upToAnnualIncome: 500000, ratePct: 10 },
        { upToAnnualIncome: 1000000, ratePct: 20 },
        { upToAnnualIncome: null, ratePct: 30 }
      ],
      standardDeduction: 0,
      rebateThresholdIncome: 0,
      cessPct: 3
    },
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
  ],
  newRegime: [
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
  ]
};
