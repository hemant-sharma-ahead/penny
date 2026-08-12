// PPF interest rate table (2026-08-08) — see docs/features/portfolio/retirement.md. Served as a
// small, static JSON route so a rate change (at most once a year, and only after the Finance
// Ministry officially notifies it) never needs an app-store release — just a redeploy of this
// worker. No KV/D1 storage: this changes far too rarely to justify it, and a static in-source
// table is trivially auditable in a diff.
//
// DAY-PRECISION, not month-precision: every PPF rate change here lands on a calendar-month/quarter
// boundary EXCEPT one — the 12%→11% cut took effect 15-Jan-2000, genuinely mid-month. See the fuller
// rationale in `packages/core/src/core/portfolio/ppfInterestRates.ts`'s module doc comment.
//
// This is a standalone copy of the same shape `ppfInterestRates.ts` defines client-side
// (`PpfRatePeriod`/`PpfRateTable`) — `workers/` is deliberately excluded from the pnpm workspace
// (see CLAUDE.md) and doesn't depend on `packages/core`, so the two are kept in sync by hand. If you
// update one, update the other. Mirrors `epfRates.ts`'s pattern.

interface PpfRatePeriod {
  effectiveFrom: string; // "YYYY-MM-DD"
  ratePct: number;
}

interface PpfRateTable {
  periods: PpfRatePeriod[];
  confirmedThrough: string; // "YYYY-MM-DD" — the last day any period here is actually confirmed to cover
}

export const PPF_RATE_TABLE: PpfRateTable = {
  confirmedThrough: '2027-03-31',
  periods: [
    { effectiveFrom: '1986-04-01', ratePct: 12.0 },
    { effectiveFrom: '2000-01-15', ratePct: 11.0 }, // genuinely mid-month
    { effectiveFrom: '2001-04-01', ratePct: 9.5 },
    { effectiveFrom: '2002-04-01', ratePct: 9.0 },
    { effectiveFrom: '2003-04-01', ratePct: 8.0 },
    { effectiveFrom: '2011-12-01', ratePct: 8.6 },
    { effectiveFrom: '2012-04-01', ratePct: 8.8 },
    { effectiveFrom: '2013-04-01', ratePct: 8.7 },
    { effectiveFrom: '2016-04-01', ratePct: 8.1 },
    { effectiveFrom: '2016-10-01', ratePct: 8.0 },
    { effectiveFrom: '2017-04-01', ratePct: 7.9 },
    { effectiveFrom: '2017-07-01', ratePct: 7.8 },
    { effectiveFrom: '2018-01-01', ratePct: 7.6 },
    { effectiveFrom: '2018-10-01', ratePct: 8.0 },
    { effectiveFrom: '2019-07-01', ratePct: 7.9 },
    { effectiveFrom: '2020-04-01', ratePct: 7.1 }
  ]
};
