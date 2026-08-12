// EPF interest rate table (2026-08-07) — see docs/plans/epf-passbook-import.md §7. Rates change at
// most once a year (and only after EPFO officially declares/ratifies them, often well into or
// after the FY they apply to), so this is fetched from a small, mostly-static Cloudflare Worker
// route rather than a live API — a rate change then never needs an app-store release. The app
// still ships with this exact table baked in as an offline-first fallback (`EPF_RATE_PERIODS_FALLBACK`
// below): network access only ever REFRESHES the table when available, it's never REQUIRED, matching
// Penny's local-first principle even for this one server-touching feature.
import { EPF_RATES_BASE } from '@/core/net/apiBase';
import { getItem, setItem } from './ratesStorage';

/** One rate applying from a given month onward, until the next entry's `effectiveFrom` (or
 *  `confirmedThrough`, for the last entry — see `EpfRateTable`). Modelled as periods rather than
 *  one-rate-per-financial-year specifically so a mid-year rate change (2000-01: 12% Apr-Jun, 11%
 *  Jul-Mar — the one historical case, confirmed with the user) needs no special-casing anywhere
 *  that consumes this list — it's just two consecutive periods, like any other rate change. */
export interface EpfRatePeriod {
  /** "YYYY-MM" — the first month this rate applies to. */
  effectiveFrom: string;
  ratePct: number;
}

/** The resolved rate table `getEpfRatePeriods()` returns — the rate periods PLUS an explicit
 *  boundary on how far they're actually confirmed to extend. Without this, looking up a month past
 *  the last declared rate would either throw or silently extrapolate the last known rate
 *  indefinitely into an undeclared future year — both wrong. EPFO routinely doesn't
 *  declare/ratify a year's rate until well into or after that year starts (one of this feature's
 *  real reference passbook samples literally showed "Interest details N/A" for exactly this
 *  reason), so "we don't know yet" is a real, expected, recurring state this type makes explicit
 *  rather than something a caller has to infer from an empty/missing lookup result. */
export interface EpfRateTable {
  periods: EpfRatePeriod[];
  /** "YYYY-MM" — the last month any period in `periods` is actually confirmed to cover. A lookup
   *  for a month after this surfaces as "rate not yet available" (see `lookupRateForMonth`),
   *  never a silent reuse of the last period's rate. */
  confirmedThrough: string;
}

/** The full 1986-87 to 2026-27 table, confirmed with the user (see docs/plans/epf-passbook-import.md
 *  §7.1) — baked in as the offline-first fallback and the initial seed for the Worker's own static
 *  JSON route. Kept sorted ascending by `effectiveFrom` — callers rely on this ordering. Confirmed
 *  through FY2026-27's March (2027-03) — the latest rate this table actually declares. */
export const EPF_RATE_TABLE_FALLBACK: EpfRateTable = {
  confirmedThrough: '2027-03',
  periods: [
    { effectiveFrom: '1986-04', ratePct: 11.0 },
    { effectiveFrom: '1987-04', ratePct: 11.5 },
    { effectiveFrom: '1988-04', ratePct: 11.8 },
    { effectiveFrom: '1989-04', ratePct: 12.0 },
    // 1989-04 through 1999-04 all held at 12.00% — no additional periods needed until the first
    // actual change, since a period applies indefinitely until the next one starts.
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
    // 2023-04 onward holds at 8.25% through FY2026-27 (the latest confirmed rate) — no further
    // periods needed until the next actual change is declared.
  ]
};

const CACHE_KEY = 'penny_epf_rate_table_v1';
const REFRESH_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — see module doc comment

let memCache: EpfRateTable | null = null;

interface CachedTable {
  table: EpfRateTable;
  fetchedAt: number;
}

function isValidRateTable(value: unknown): value is EpfRateTable {
  if (!value || typeof value !== 'object') return false;
  const table = value as EpfRateTable;
  return (
    typeof table.confirmedThrough === 'string' &&
    Array.isArray(table.periods) &&
    table.periods.every(
      (p): p is EpfRatePeriod =>
        !!p && typeof p === 'object' && typeof p.effectiveFrom === 'string' && typeof p.ratePct === 'number'
    )
  );
}

/** Returns the best rate table available: a fresh local cache if one exists and isn't stale,
 *  otherwise a live fetch from the Worker (cached locally on success), otherwise — if offline or
 *  the Worker is unreachable — silently falls back to `EPF_RATE_TABLE_FALLBACK` so the interest
 *  calculator always has SOME table to work with. Never throws. */
export async function getEpfRateTable(): Promise<EpfRateTable> {
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

  if (EPF_RATES_BASE) {
    try {
      const res = await fetch(EPF_RATES_BASE);
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

  memCache = EPF_RATE_TABLE_FALLBACK;
  return memCache;
}

/** Looks up the annual rate (as a percentage, e.g. 8.25) in effect for a given "YYYY-MM" month.
 *  Returns `null` when the month is either before the table's first period, or AFTER
 *  `confirmedThrough` — the latter is the common, expected "EPFO hasn't declared this year's rate
 *  yet" case, not an error; callers should surface this as "rate not yet available for FY X",
 *  never silently reuse the last known rate for an unconfirmed future month. */
export function lookupRateForMonth(table: EpfRateTable, month: string): number | null {
  if (month > table.confirmedThrough) return null;
  let result: number | null = null;
  for (const p of table.periods) {
    if (p.effectiveFrom <= month) result = p.ratePct;
    else break;
  }
  return result;
}
