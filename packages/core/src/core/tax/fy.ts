// Financial-year selection helpers (India FY = 1 April → 31 March). Used by the multi-FY tax views.

import { EARLIEST_FY_START, LATEST_FY_START } from './regimeHistory';

export interface FYOption {
  startYear: number; // 2025 ⇒ FY2025-26
  label: string; // "FY 2025-26"
}

/** FY start year for an instant (April 1 boundary). */
export function fyStartYearOf(nowMs: number): number {
  const d = new Date(nowMs);
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; // April = month 3
}

/** [start, end] epoch ms for a financial year. */
export function fyWindow(startYear: number): { start: number; end: number } {
  return {
    start: new Date(startYear, 3, 1).getTime(),
    end: new Date(startYear + 1, 2, 31, 23, 59, 59, 999).getTime()
  };
}

/** Short label, e.g. "FY 2025-26". */
export function shortFYLabel(startYear: number): string {
  return `FY ${startYear}-${String(startYear + 1).slice(2)}`;
}

/**
 * Selectable FYs from the current FY (clamped to the latest we model) back to the earliest,
 * newest first — for the FY switcher.
 */
export function selectableFYs(nowMs: number): FYOption[] {
  const current = Math.min(fyStartYearOf(nowMs), LATEST_FY_START);
  const out: FYOption[] = [];
  for (let y = current; y >= EARLIEST_FY_START; y--) {
    out.push({ startYear: y, label: shortFYLabel(y) });
  }
  return out;
}
