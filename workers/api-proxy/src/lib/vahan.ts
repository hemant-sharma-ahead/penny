// Pure decision logic for the vahandetails (vehicle) proxy: daily budget, the morning working
// window, and the cache/fetch/queue decision. No Cloudflare imports — unit-tested from the app's
// main test suite (tests/worker/). vahandetails allows ~1000 free upstream calls/day, morning only;
// each vehicle fetch is 2 upstream calls (RC + challans), so the budget is expressed in CALLS.

export const VAHAN_DAILY_BUDGET = 900; // calls/day — headroom under the ~1000 free limit
export const CALLS_PER_FETCH = 2; // RC details + challans
export const WINDOW_START_HOUR_IST = 6; // 06:00 IST
export const WINDOW_END_HOUR_IST = 12; // 12:00 IST (Vahan is reliable in the morning)

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** IST hour + a `YYYY-MM-DD` day key (used to bucket + reset the daily budget). */
export function istParts(nowMs: number): { hour: number; dayKey: string } {
  const d = new Date(nowMs + IST_OFFSET_MS);
  const dayKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { hour: d.getUTCHours(), dayKey };
}

export function inWorkingWindow(nowMs: number): boolean {
  const { hour } = istParts(nowMs);
  return hour >= WINDOW_START_HOUR_IST && hour < WINDOW_END_HOUR_IST;
}

/** Whether at least one more vehicle fetch (CALLS_PER_FETCH calls) fits in today's budget. */
export function canSpend(used: number): boolean {
  return used + CALLS_PER_FETCH <= VAHAN_DAILY_BUDGET;
}

export type VahanDecision = 'serve_cache' | 'fetch_now' | 'queue';

/**
 * Decide what to do with a `/vehicle/:regno` request:
 * - cached and not a forced refresh → serve the permanent cache (zero upstream),
 * - otherwise fetch now only inside the morning window with budget left,
 * - else queue it (deduped per reg) for the morning Cron drain.
 */
export function decideVahan(o: {
  cached: boolean;
  refresh: boolean;
  budgetUsed: number;
  nowMs: number;
}): VahanDecision {
  if (o.cached && !o.refresh) return 'serve_cache';
  if (inWorkingWindow(o.nowMs) && canSpend(o.budgetUsed)) return 'fetch_now';
  return 'queue';
}

/** Normalize a registration number the same way the client does (uppercase, no spaces). */
export function normalizeReg(reg: string): string {
  return reg.toUpperCase().replace(/\s+/g, '');
}

/** Epoch ms of the next 06:00 IST at/after `nowMs` — the ETA we promise a queued lookup. */
export function nextWindowStartMs(nowMs: number): number {
  const ist = new Date(nowMs + IST_OFFSET_MS);
  const todayStartIstMs = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate(),
    WINDOW_START_HOUR_IST,
    0,
    0,
    0
  );
  let realMs = todayStartIstMs - IST_OFFSET_MS;
  if (realMs <= nowMs) realMs += 24 * 60 * 60 * 1000;
  return realMs;
}
