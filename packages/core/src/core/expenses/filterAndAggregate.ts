import type { Expense } from '@/core/db/types';
import { toDateKey, dateLabel } from '@/lib/date';
import { toMonthYearKey } from '@/lib/formatters';

export interface GroupedDay {
  label: string;
  items: Expense[];
}

export function groupExpensesByDate(expenses: Expense[]): GroupedDay[] {
  // Sort once, globally, in the exact final within-day order this function has always produced —
  // newest date first, ties broken by newest createdAt first. The previous implementation grouped
  // into a Map first (one push per row), then separately `.sort()`ed AND spread-copied every
  // individual day's own item array — for an account with transactions spread across thousands of
  // distinct days, that's thousands of tiny sort/copy operations instead of one. Found 2026-08-28,
  // real-device testing: this cost 700ms-1.5s for ~5,000 rows on its own (compounded further by a
  // separate double-render bug — see `AccountDetailModal.tsx`'s matching fix). Sorting the whole
  // array once up front means every same-day row is already contiguous and in its final order, so
  // the grouping pass below is a single O(n) walk with no further sorting or copying needed.
  const sorted = [...expenses].sort((a, b) => b.date - a.date || b.createdAt - a.createdAt);
  const groups: GroupedDay[] = [];
  let currentKey: string | null = null;
  let currentItems: Expense[] = [];
  for (const e of sorted) {
    const key = toDateKey(e.date);
    if (key !== currentKey) {
      if (currentKey !== null) groups.push({ label: dateLabel(currentKey), items: currentItems });
      currentKey = key;
      currentItems = [];
    }
    currentItems.push(e);
  }
  if (currentKey !== null) groups.push({ label: dateLabel(currentKey), items: currentItems });
  return groups;
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

/** All-time transaction count per categoryId — used to gate category delete/move. */
export function calcTxnCountByCategory(expenses: Expense[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of expenses) {
    map.set(e.categoryId, (map.get(e.categoryId) ?? 0) + 1);
  }
  return map;
}
