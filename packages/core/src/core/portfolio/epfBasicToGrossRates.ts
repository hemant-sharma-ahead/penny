// EPF Basic-to-Gross ratio table (2026-08-30) — real reported gap: Penny's own CTC/Gross/Net
// Monthly estimates (`estimateGrossAndCtc`) always used ONE flat default ratio
// (`EPF_DEFAULT_BASIC_TO_GROSS_PCT`, 50%) regardless of which year a hike happened in — a real
// mismatch reported against a real Nov 2014 hike point, where the actual CTC was meaningfully higher
// than the flat-50% estimate. 50% only became the common convention once the Code on Wages 2019's
// "wages must be at least 50% of total remuneration" floor took effect (notified across the labour
// codes around Nov 2025) — before that, a lower ratio (Basic + DA against a Gross that also included
// HRA/other allowances) was the far more typical structure. Fetched from a small, mostly-static
// Cloudflare Worker route (same architecture as `epfInterestRates.ts`/`ppfInterestRates.ts`) so this
// convention can be corrected/extended without an app-store release — the app still ships this exact
// table baked in as an offline-first fallback, per this project's local-first principle.
//
// Explicitly NOT modelled the same way as `EpfRateTable`'s `confirmedThrough` — an EPF/PPF interest
// rate is a real, officially-declared-or-not-yet fact; a Basic-to-Gross ratio is Penny's own
// best-effort CONVENTION for a missing real value, always has SOME default regardless of how far in
// the future a lookup month is, and is always just a starting point the user can override with their
// own real ratio (`EpfEmployer.basicToGrossPct`) — never asserted as fact either way.
import { EPF_BASIC_TO_GROSS_RATES_BASE } from '@/core/net/apiBase';
import { getItem, setItem } from './ratesStorage';

export interface EpfBasicToGrossPeriod {
  /** "YYYY-MM" — the first month this ratio applies to. */
  effectiveFrom: string;
  pct: number;
}

export interface EpfBasicToGrossTable {
  periods: EpfBasicToGrossPeriod[];
}

/** Baked-in offline-first fallback and the initial seed for the Worker's own static JSON route. Kept
 *  sorted ascending by `effectiveFrom` — `lookupBasicToGrossPctForMonth` relies on this ordering. */
export const EPF_BASIC_TO_GROSS_TABLE_FALLBACK: EpfBasicToGrossTable = {
  periods: [
    { effectiveFrom: '1986-04', pct: 40 },
    { effectiveFrom: '2025-11', pct: 50 }
  ]
};

const CACHE_KEY = 'penny_epf_basic_to_gross_table_v1';
const REFRESH_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — matches epfInterestRates.ts

let memCache: EpfBasicToGrossTable | null = null;

interface CachedTable {
  table: EpfBasicToGrossTable;
  fetchedAt: number;
}

function isValidTable(value: unknown): value is EpfBasicToGrossTable {
  if (!value || typeof value !== 'object') return false;
  const table = value as EpfBasicToGrossTable;
  return (
    Array.isArray(table.periods) &&
    table.periods.length > 0 &&
    table.periods.every(
      (p): p is EpfBasicToGrossPeriod =>
        !!p && typeof p === 'object' && typeof p.effectiveFrom === 'string' && typeof p.pct === 'number'
    )
  );
}

/** Returns the best table available: a fresh local cache if one exists and isn't stale, otherwise a
 *  live fetch from the Worker (cached locally on success), otherwise — if offline or the Worker is
 *  unreachable — silently falls back to `EPF_BASIC_TO_GROSS_TABLE_FALLBACK`. Never throws. */
export async function getEpfBasicToGrossTable(): Promise<EpfBasicToGrossTable> {
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

  if (EPF_BASIC_TO_GROSS_RATES_BASE) {
    try {
      const res = await fetch(EPF_BASIC_TO_GROSS_RATES_BASE);
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

  memCache = EPF_BASIC_TO_GROSS_TABLE_FALLBACK;
  return memCache;
}

/** The ratio (as a percentage, e.g. 50) in effect for a given "YYYY-MM" month — always returns a real
 *  number, never `null` (unlike `lookupRateForMonth`'s EPF-interest equivalent): this is Penny's own
 *  convention default, not an official rate that can be "not yet declared." A month before the
 *  table's first period falls back to that first period's own ratio (there's always at least one). */
export function lookupBasicToGrossPctForMonth(table: EpfBasicToGrossTable, month: string): number {
  let result = table.periods[0]?.pct ?? 50;
  for (const p of table.periods) {
    if (p.effectiveFrom <= month) result = p.pct;
    else break;
  }
  return result;
}
