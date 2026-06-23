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

export function epochToDateInput(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
