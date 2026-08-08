// EPF interest rate table (2026-08-07) — see docs/plans/epf-passbook-import.md §7. Served as a
// small, static JSON route so a rate change (at most once a year, and only after EPFO officially
// declares/ratifies it) never needs an app-store release — just a redeploy of this worker. No
// KV/D1 storage: this changes far too rarely to justify it, and a static in-source table is
// trivially auditable in a diff.
//
// This is a standalone copy of the same shape `packages/core/src/core/portfolio/epfInterestRates.ts`
// defines client-side (`EpfRatePeriod`/`EpfRateTable`) — `workers/` is deliberately excluded from
// the pnpm workspace (see CLAUDE.md) and doesn't depend on `packages/core`, so the two are kept in
// sync by hand. If you update one, update the other — see that file's own doc comment for the full
// rationale (rate-period modelling, the 2000-01 mid-year split, `confirmedThrough`'s "not yet
// declared" semantics).

interface EpfRatePeriod {
  effectiveFrom: string; // "YYYY-MM"
  ratePct: number;
}

interface EpfRateTable {
  periods: EpfRatePeriod[];
  confirmedThrough: string; // "YYYY-MM" — the last month any period here is actually confirmed to cover
}

export const EPF_RATE_TABLE: EpfRateTable = {
  confirmedThrough: '2027-03',
  periods: [
    { effectiveFrom: '1986-04', ratePct: 11.0 },
    { effectiveFrom: '1987-04', ratePct: 11.5 },
    { effectiveFrom: '1988-04', ratePct: 11.8 },
    { effectiveFrom: '1989-04', ratePct: 12.0 },
    { effectiveFrom: '2000-04', ratePct: 12.0 },
    { effectiveFrom: '2000-07', ratePct: 11.0 }, // the one historical mid-year change
    { effectiveFrom: '2001-04', ratePct: 9.5 },
    { effectiveFrom: '2005-04', ratePct: 8.5 },
    { effectiveFrom: '2010-04', ratePct: 9.5 },
    { effectiveFrom: '2011-04', ratePct: 8.25 },
    { effectiveFrom: '2012-04', ratePct: 8.5 },
    { effectiveFrom: '2013-04', ratePct: 8.75 },
    { effectiveFrom: '2015-04', ratePct: 8.8 },
    { effectiveFrom: '2016-04', ratePct: 8.65 },
    { effectiveFrom: '2017-04', ratePct: 8.55 },
    { effectiveFrom: '2018-04', ratePct: 8.65 },
    { effectiveFrom: '2019-04', ratePct: 8.5 },
    { effectiveFrom: '2021-04', ratePct: 8.1 },
    { effectiveFrom: '2022-04', ratePct: 8.15 },
    { effectiveFrom: '2023-04', ratePct: 8.25 }
  ]
};
