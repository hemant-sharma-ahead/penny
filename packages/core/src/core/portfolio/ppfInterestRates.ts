// PPF interest rate table (2026-08-08) — see docs/features/portfolio/retirement.md. Rates change at
// most once a year (and only after the Finance Ministry officially notifies them), so this is
// fetched from a small, mostly-static Cloudflare Worker route rather than a live API — a rate
// change then never needs an app-store release. The app still ships with this exact table baked in
// as an offline-first fallback (`PPF_RATE_TABLE_FALLBACK` below): network access only ever
// REFRESHES the table when available, it's never REQUIRED, matching Penny's local-first principle
// even for this one server-touching feature. Broadly mirrors `epfInterestRates.ts`'s pattern — see
// that file for the fuller rationale writeup — with one deliberate difference explained below.
//
// DAY-PRECISION, not month-precision (unlike EPF's table): every PPF rate change in this table
// lands on a calendar-month or calendar-quarter boundary EXCEPT one — the 12%→11% cut took effect
// 15-Jan-2000, genuinely mid-month, confirmed independently across multiple sources (StableInvestor,
// MoneyPundit, Dataful, India.com — no single authoritative government gazette/notification text
// was found for this specific 26-year-old change, only secondary trackers agreeing on the exact
// date). PPF interest is itself calculated once per calendar month (on the lowest balance between
// the close of the 5th and the last day of the month), so a genuinely mid-month rate change doesn't
// have one obviously-correct "which whole month wins" answer — rather than silently pick a month
// bucket and lose the sourced fact, `effectiveFrom`/`confirmedThrough` here store the exact ISO date
// ("YYYY-MM-DD"), and `lookupRateForMonth()` documents its own resolution convention explicitly
// (see that function's comment) so a future, more-informed interest calculator can revisit just that
// one convention without needing to re-derive the underlying historical data.
import { PPF_RATES_BASE } from '@/core/net/apiBase';
import { getItem, setItem } from './ratesStorage';

/** One rate applying from a given day onward, until the next entry's `effectiveFrom` (or
 *  `confirmedThrough`, for the last entry — see `PpfRateTable`). Day-precision (not month), unlike
 *  EPF's period model — see this file's top-of-module comment for why. */
export interface PpfRatePeriod {
  /** "YYYY-MM-DD" — the exact first day this rate applies to. */
  effectiveFrom: string;
  ratePct: number;
}

/** The resolved rate table `getPpfRateTable()` returns — the rate periods PLUS an explicit boundary
 *  on how far they're actually confirmed to extend. Without this, looking up a date past the last
 *  declared rate would either throw or silently extrapolate the last known rate indefinitely into
 *  an undeclared future period — both wrong. See `EpfRateTable`'s doc comment for the fuller
 *  rationale; identical reasoning applies here. */
export interface PpfRateTable {
  periods: PpfRatePeriod[];
  /** "YYYY-MM-DD" — the last day any period in `periods` is actually confirmed to cover. A lookup
   *  for a date after this surfaces as "rate not yet available" (see `lookupRateForDate`), never a
   *  silent reuse of the last period's rate. */
  confirmedThrough: string;
}

/** The full 1986-87 to 2026-27 table, supplied by the user (2026-08-08) — baked in as the
 *  offline-first fallback and the initial seed for the Worker's own static JSON route
 *  (`workers/api-proxy/src/ppfRates.ts` — keep both in sync by hand, see that file's comment).
 *  Kept sorted ascending by `effectiveFrom` — callers rely on this ordering. Confirmed through
 *  FY2026-27's March (2027-03-31) — the latest rate this table actually declares. */
export const PPF_RATE_TABLE_FALLBACK: PpfRateTable = {
  confirmedThrough: '2027-03-31',
  periods: [
    { effectiveFrom: '1986-04-01', ratePct: 12.0 },
    { effectiveFrom: '2000-01-15', ratePct: 11.0 }, // genuinely mid-month — see module doc comment
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
    // 2020-04-01 onward holds at 7.1% through FY2026-27 (the latest confirmed rate) — no further
    // periods needed until the next actual change is declared.
  ]
};

const CACHE_KEY = 'penny_ppf_rate_table_v1';
const REFRESH_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — see module doc comment

let memCache: PpfRateTable | null = null;

interface CachedTable {
  table: PpfRateTable;
  fetchedAt: number;
}

function isValidRateTable(value: unknown): value is PpfRateTable {
  if (!value || typeof value !== 'object') return false;
  const table = value as PpfRateTable;
  return (
    typeof table.confirmedThrough === 'string' &&
    Array.isArray(table.periods) &&
    table.periods.every(
      (p): p is PpfRatePeriod =>
        !!p && typeof p === 'object' && typeof p.effectiveFrom === 'string' && typeof p.ratePct === 'number'
    )
  );
}

/** Returns the best rate table available: a fresh local cache if one exists and isn't stale,
 *  otherwise a live fetch from the Worker (cached locally on success), otherwise — if offline or
 *  the Worker is unreachable — silently falls back to `PPF_RATE_TABLE_FALLBACK` so any PPF interest
 *  calculation always has SOME table to work with. Never throws. */
export async function getPpfRateTable(): Promise<PpfRateTable> {
  if (memCache) return memCache;

  try {
    const cached = await getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedTable;
      if (isValidRateTable(parsed.table) && Date.now() - parsed.fetchedAt < REFRESH_INTERVAL_MS) {
        memCache = parsed.table;
        return memCache;
      }
    }
  } catch {
    // corrupt cache — fall through to a live fetch
  }

  if (PPF_RATES_BASE) {
    try {
      const res = await fetch(PPF_RATES_BASE);
      if (res.ok) {
        const json: unknown = await res.json();
        if (isValidRateTable(json)) {
          memCache = json;
          await setItem(CACHE_KEY, JSON.stringify({ table: json, fetchedAt: Date.now() } satisfies CachedTable));
          return memCache;
        }
      }
    } catch {
      // offline / worker unreachable — fall through to the baked-in table
    }
  }

  memCache = PPF_RATE_TABLE_FALLBACK;
  return memCache;
}

/** Looks up the annual rate (as a percentage, e.g. 7.1) in effect for a specific "YYYY-MM-DD" date —
 *  the precise, unambiguous lookup. Returns `null` when the date is either before the table's first
 *  period, or AFTER `confirmedThrough` — the latter is the common, expected "not yet declared" case,
 *  not an error; callers should surface this as "rate not yet available", never silently reuse the
 *  last known rate for an unconfirmed future date. */
export function lookupRateForDate(table: PpfRateTable, dateIso: string): number | null {
  if (dateIso > table.confirmedThrough) return null;
  let result: number | null = null;
  for (const p of table.periods) {
    if (p.effectiveFrom <= dateIso) result = p.ratePct;
    else break;
  }
  return result;
}

function endOfMonthIso(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y ?? 1970, m ?? 1, 0).getDate(); // day 0 of next month = last day of this one
  return `${month}-${String(lastDay).padStart(2, '0')}`;
}

/** Convenience lookup for a "YYYY-MM" month bucket (PPF interest is itself calculated once per
 *  calendar month, so most callers want "the rate for March 2020", not a specific day). Resolves to
 *  the rate in effect on the LAST day of that month — a deliberate, documented convention, not a
 *  verified administrative fact: for the one month that genuinely straddles a rate change
 *  (January 2000 — 12% through the 14th, 11% from the 15th, see module doc comment), no
 *  authoritative source was found for which rate the government/banks actually used when computing
 *  *that specific month's* interest. End-of-month was chosen as the more defensible default (it
 *  matches the "lowest balance between 5th and last day of month" calculation window's own end
 *  reference point) but should be revisited if a real interest-verification feature is ever built
 *  for a passbook old enough to include that month — use `lookupRateForDate` directly if exact-day
 *  precision matters more than this convenience. */
export function lookupRateForMonth(table: PpfRateTable, month: string): number | null {
  return lookupRateForDate(table, endOfMonthIso(month));
}
