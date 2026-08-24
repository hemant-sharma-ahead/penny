function toIndianGrouping(n: number): string {
  const str = Math.abs(Math.round(n)).toString();
  if (str.length <= 3) return str;

  const tail = str.slice(-3);
  const head = str.slice(0, -3);
  const groups: string[] = [];
  for (let i = head.length; i > 0; i -= 2) {
    groups.unshift(head.slice(Math.max(0, i - 2), i));
  }
  return [...groups, tail].join(',');
}

/**
 * App-wide currency formatter — always shows 2 decimal places (changed 2026-08-20, item 33
 * real-device testing pass; previously rounded to whole rupees). ~590 call sites already funnel
 * through this one function, so changing its body here updates the whole app consistently rather
 * than swapping every call site to a separate decimal variant.
 */
export function formatCurrency(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const intPart = Math.floor(abs);
  const decPart = Math.round((abs - intPart) * 100);
  return `${sign}₹${toIndianGrouping(intPart)}.${String(decPart).padStart(2, '0')}`;
}

/** @deprecated Identical to `formatCurrency` now that it always shows 2 decimals — kept only for
 *  any lingering import; prefer `formatCurrency` in new code. */
export const formatCurrencyDecimal = formatCurrency;

export function formatCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}K`;
  return formatCurrency(amount);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/** Parses a numeric input string, returning 0 for empty/invalid values. */
export function parseNumber(s: string): number {
  return parseFloat(s) || 0;
}

/**
 * Human-readable file size, e.g. `formatBytes(3_650_000)` → `"3.5 MB"`. Added for Backup History's
 * per-entry size line — no such formatter existed anywhere in the codebase before it (checked
 * `apps/mobile/src/lib/` and here). Binary (1024-based) units, one decimal place, no decimal for whole
 * bytes — matches how most OS file browsers show size, which is what users comparing entries expect.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

// Date/time helpers live in ./date — re-exported here for backwards-compatible imports.
// Prefer importing date utilities directly from '@/lib/date' in new code.
export {
  formatDate,
  formatDateShort,
  formatMonthsDuration,
  toMonthYearKey,
  epochToDateInput,
  toDateKey,
  dateLabel,
  offsetMonth,
  monthLabel,
  monthChipLabel
} from './date';
