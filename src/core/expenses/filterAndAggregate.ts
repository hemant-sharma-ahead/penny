import type { Expense } from '@/core/db/types';
import { toDateKey, dateLabel } from '@/lib/dateUtils';
import { toMonthYearKey } from '@/lib/formatters';

export interface GroupedDay {
  label: string;
  items: Expense[];
}

export function groupExpensesByDate(expenses: Expense[]): GroupedDay[] {
  const map = new Map<string, Expense[]>();
  for (const e of expenses) {
    const key = toDateKey(e.date);
    const arr = map.get(key) ?? [];
    arr.push(e);
    map.set(key, arr);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => ({ label: dateLabel(key), items: [...items].sort((a, b) => b.date - a.date) }));
}

export function calcSpendByCategory(expenses: Expense[], month: string = toMonthYearKey()): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of expenses) {
    if (toMonthYearKey(new Date(e.date)) !== month) continue;
    if (e.type && e.type !== 'expense') continue;
    map.set(e.categoryId, (map.get(e.categoryId) ?? 0) + e.amount);
  }
  return map;
}
