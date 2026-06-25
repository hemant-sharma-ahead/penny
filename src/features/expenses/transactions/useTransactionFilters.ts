import { useMemo, useState } from 'react';
import type { Expense, ExpenseCategory, TransactionType } from '@/core/db/types';
import { normalizeHashtag } from '@/context/EventModeContext';
import { toMonthYearKey } from '@/lib/formatters';
import { groupExpensesByDate } from '@/core/expenses/filterAndAggregate';
import { groupKey } from '@/core/expenses/categoryGroups';
import type { FilterState } from './FilterModal';

/**
 * Owns all transaction-list filter state (search, type, account, category, event, month),
 * and derives the filtered/grouped expense list, running total, and active-filter count.
 */
export function useTransactionFilters(expenses: Expense[], categoryMap: Map<string, ExpenseCategory>) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [accountFilters, setAccountFilters] = useState<Set<string>>(new Set());
  const [parentCategoryFilters, setParentCategoryFilters] = useState<Set<string>>(new Set());
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set());
  const [eventFilters, setEventFilters] = useState<Set<string>>(new Set());
  const [monthFilter, setMonthFilter] = useState<string | null>(null);

  const activeFilterCount =
    (monthFilter ? 1 : 0) +
    (typeFilter !== 'all' ? 1 : 0) +
    (accountFilters.size > 0 ? 1 : 0) +
    (parentCategoryFilters.size > 0 || categoryFilters.size > 0 ? 1 : 0) +
    (eventFilters.size > 0 ? 1 : 0);

  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      if (typeFilter !== 'all' && (e.type ?? 'expense') !== typeFilter) return false;
      if (accountFilters.size > 0 && !accountFilters.has(e.accountId ?? '')) return false;
      if (categoryFilters.size > 0) {
        if (!categoryFilters.has(e.categoryId)) return false;
      } else if (parentCategoryFilters.size > 0) {
        const cat = categoryMap.get(e.categoryId);
        if (!cat || !parentCategoryFilters.has(groupKey(cat))) return false;
      }
      if (eventFilters.size > 0) {
        const hasMatch = e.hashtags.some((t) => {
          const norm = normalizeHashtag(t);
          return [...eventFilters].some((f) => normalizeHashtag(f) === norm);
        });
        if (!hasMatch) return false;
      }
      if (monthFilter && toMonthYearKey(new Date(e.date)) !== monthFilter) return false;
      if (q) {
        const cat = categoryMap.get(e.categoryId);
        const matchDesc = e.description.toLowerCase().includes(q);
        const matchCat = cat?.name.toLowerCase().includes(q) ?? false;
        const matchTag = e.hashtags.some((t) => t.toLowerCase().includes(q));
        if (!matchDesc && !matchCat && !matchTag) return false;
      }
      return true;
    });
  }, [
    expenses,
    typeFilter,
    accountFilters,
    parentCategoryFilters,
    categoryFilters,
    eventFilters,
    monthFilter,
    search,
    categoryMap
  ]);

  const filteredTotal = useMemo(
    () => filteredExpenses.filter((e) => !e.type || e.type === 'expense').reduce((s, e) => s + e.amount, 0),
    [filteredExpenses]
  );

  const grouped = useMemo(() => groupExpensesByDate(filteredExpenses), [filteredExpenses]);

  const filterState: FilterState = {
    monthFilter,
    typeFilter: typeFilter as FilterState['typeFilter'],
    accountFilters,
    parentCategoryFilters,
    categoryFilters,
    eventFilters
  };

  function applyFilters(filters: FilterState) {
    setMonthFilter(filters.monthFilter);
    setTypeFilter(filters.typeFilter);
    setAccountFilters(filters.accountFilters);
    setParentCategoryFilters(filters.parentCategoryFilters);
    setCategoryFilters(filters.categoryFilters);
    setEventFilters(filters.eventFilters);
  }

  function clearChipFilters() {
    setTypeFilter('all');
    setAccountFilters(new Set());
    setParentCategoryFilters(new Set());
    setCategoryFilters(new Set());
    setEventFilters(new Set());
  }

  return {
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    accountFilters,
    setAccountFilters,
    parentCategoryFilters,
    setParentCategoryFilters,
    categoryFilters,
    setCategoryFilters,
    eventFilters,
    setEventFilters,
    monthFilter,
    setMonthFilter,
    activeFilterCount,
    filteredExpenses,
    filteredTotal,
    grouped,
    filterState,
    applyFilters,
    clearChipFilters
  };
}
