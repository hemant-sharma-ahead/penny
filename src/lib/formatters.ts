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

export function formatCurrency(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}₹${toIndianGrouping(amount)}`;
}

export function formatCurrencyDecimal(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const intPart = Math.floor(abs);
  const decPart = Math.round((abs - intPart) * 100);
  return `${sign}₹${toIndianGrouping(intPart)}.${String(decPart).padStart(2, '0')}`;
}

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
  monthLabel
} from './date';
