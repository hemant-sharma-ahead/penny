// EPF Basic-to-Gross ratio table (2026-08-30) — see docs/plans/epf-passbook-import.md's 2026-08-11
// follow-up round for the original single-flat-default design, and
// `packages/core/src/core/portfolio/epfBasicToGrossRates.ts`'s own doc comment for why this exists
// and what it is (and isn't). Served as a small, static JSON route — same rationale as `/epf-rates`.
//
// This is a standalone copy of the same shape `epfBasicToGrossRates.ts` defines client-side
// (`EpfBasicToGrossPeriod`/`EpfBasicToGrossTable`) — `workers/` is deliberately excluded from the
// pnpm workspace (see CLAUDE.md) and doesn't depend on `packages/core`, so the two are kept in sync
// by hand, same convention as `epfRates.ts`/`ppfRates.ts`. If you update one, update the other.
//
// UNLIKE the EPF/PPF interest rate tables, this is NOT an officially declared government rate —
// there is no single authoritative "the" Basic-to-Gross ratio for a given year; it's Penny's own
// best-effort CONVENTION for whatever a typical Indian payroll structure looked like in that era,
// used only as a starting estimate the user can always override with their own real ratio. The one
// genuinely dated fact behind the one period change below is the Code on Wages 2019's "wages" (the
// PF/gratuity contribution base) must be at least 50% of total remuneration — notified/effective
// across the labour codes around Nov 2025.

interface EpfBasicToGrossPeriod {
  effectiveFrom: string; // "YYYY-MM"
  pct: number;
}

interface EpfBasicToGrossTable {
  periods: EpfBasicToGrossPeriod[];
}

export const EPF_BASIC_TO_GROSS_TABLE: EpfBasicToGrossTable = {
  periods: [
    // Pre-labour-code convention — commonly cited ~35-45% range for a typical Indian payroll
    // structure (Basic + DA, with the rest split across HRA/allowances); 40% is the mid-point used
    // as this era's default.
    { effectiveFrom: '1986-04', pct: 40 },
    // Code on Wages 2019's statutory floor — "wages" must be at least 50% of total remuneration.
    { effectiveFrom: '2025-11', pct: 50 }
  ]
};
