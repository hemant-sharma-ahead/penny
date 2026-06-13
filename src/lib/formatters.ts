const inrFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrDecimalFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const compactFormatter = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

export function formatCurrency(amount: number): string {
  return inrFormatter.format(amount);
}

export function formatCurrencyDecimal(amount: number): string {
  return inrDecimalFormatter.format(amount);
}

export function formatCompact(amount: number): string {
  return `₹${compactFormatter.format(amount)}`;
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatDate(epochMs: number): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(epochMs)
  );
}

export function formatDateShort(epochMs: number): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(epochMs));
}

export function formatMonthYear(epochMs: number): string {
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(epochMs));
}

export function currentMonthYear(): string {
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date());
}

export function toMonthYearKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
