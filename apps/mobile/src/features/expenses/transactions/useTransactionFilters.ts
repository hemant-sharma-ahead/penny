import { useEffect, useMemo, useState } from 'react';
import type { Expense, ExpenseCategory, TransactionType } from '@/core/db/types';
import { normalizeHashtag } from '~/context/EventModeContext';
import { toMonthYearKey } from '@/lib/formatters';
import { groupExpensesByDate } from '@/core/expenses/filterAndAggregate';
import { groupKey } from '@/core/expenses/categoryGroups';
import type { FilterState } from './FilterModal';

/**
 * Owns all transaction-list filter state (search, type, account, category, event, goal, month),
 * and derives the filtered/grouped expense list, running total, and active-filter count.
 *
 * @param txnIdsByGoal `goalId -> linked transaction ids` (`useExpenses.ts`'s own derivation from every
 *   `GoalContribution`, any origin) — powers "Filter by goal", same shape as `eventFilters`' matching.
 * @param mismatchedTxnIds `useExpenses.ts`'s `paymentModeMismatchTxnIds` (2026-08-06) — every
 *   transaction whose recorded payment mode disagrees with its original bank-statement narration.
 *   Powers "Payment mode mismatch" — a single boolean toggle, not a multi-select set like the other
 *   filters, since there's only one thing to filter by (mismatched vs. not).
 */
export function useTransactionFilters(
  expenses: Expense[],
  categoryMap: Map<string, ExpenseCategory>,
  txnIdsByGoal: Map<string, Set<string>>,
  mismatchedTxnIds: Set<string>
) {
  const [search, setSearch] = useState('');
  // The search box itself stays bound to `search` (updated synchronously on every keystroke, so typing
  // still feels instant) — only the expensive re-filter below is decoupled from it, via this debounced
  // shadow copy. Without this, every keystroke re-ran a full filter+sort pass over the entire (up to
  // 4,000+ row) expense array (found 2026-08-14, on a heavily-imported account). 200ms is comfortably
  // above per-keystroke interval for real typing but still reads as immediate once typing pauses.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [accountFilters, setAccountFilters] = useState<Set<string>>(new Set());
  const [parentCategoryFilters, setParentCategoryFilters] = useState<Set<string>>(new Set());
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set());
  const [eventFilters, setEventFilters] = useState<Set<string>>(new Set());
  const [goalFilters, setGoalFilters] = useState<Set<string>>(new Set());
  // Item 26 (docs/plans/real-device-testing-pass.md Phase 2) — multi-select, OR match, same shape as
  // `eventFilters` above.
  const [tagFilters, setTagFilters] = useState<Set<string>>(new Set());
  // Item 42 (docs/plans/real-device-testing-pass.md Phase 4) — defaults to the current month instead of
  // "All time": every open of the Expenses tab used to load/decrypt/filter/group the ENTIRE transaction
  // history (no pagination), which is both a worse default (you usually care about recent spend, not
  // all-time) and a real performance cost at high transaction counts. The top-bar month chip
  // (`TransactionsSlice.tsx`) and `FilterModal`'s Month section both already render off this same
  // `monthFilter` value, so they correctly show the active month rather than "All" as soon as this
  // changes — no separate wiring needed there.
  const [monthFilter, setMonthFilter] = useState<string | null>(() => toMonthYearKey());
  const [paymentModeMismatchOnly, setPaymentModeMismatchOnly] = useState(false);

  // Item 43 (docs/plans/real-device-testing-pass.md Phase 5) — the month-scrub-bar's chip range
  // needs the earliest recorded transaction's month as its floor. No existing helper computes this
  // (confirmed during investigation), so this is a simple one-time `Math.min` scan over the already-
  // loaded `expenses` array — memoized on `expenses` so it only re-runs when the underlying data
  // actually changes, not on every render/filter change.
  const earliestMonth = useMemo(() => {
    if (expenses.length === 0) return toMonthYearKey();
    let min = Infinity;
    for (const e of expenses) if (e.date < min) min = e.date;
    return toMonthYearKey(new Date(min));
  }, [expenses]);

  const activeFilterCount =
    (monthFilter ? 1 : 0) +
    (typeFilter !== 'all' ? 1 : 0) +
    (accountFilters.size > 0 ? 1 : 0) +
    (parentCategoryFilters.size > 0 || categoryFilters.size > 0 ? 1 : 0) +
    (eventFilters.size > 0 ? 1 : 0) +
    (goalFilters.size > 0 ? 1 : 0) +
    (tagFilters.size > 0 ? 1 : 0) +
    (paymentModeMismatchOnly ? 1 : 0);

  const filteredExpenses = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return expenses.filter((e) => {
      if (typeFilter !== 'all' && (e.type ?? 'expense') !== typeFilter) return false;
      if (accountFilters.size > 0 && !accountFilters.has(e.accountId ?? '') && !accountFilters.has(e.toAccountId ?? ''))
        return false;
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
      if (goalFilters.size > 0) {
        const matchesAnyGoal = [...goalFilters].some((goalId) => txnIdsByGoal.get(goalId)?.has(e.id));
        if (!matchesAnyGoal) return false;
      }
      if (tagFilters.size > 0) {
        const hasAnyTag = e.hashtags.some((t) => tagFilters.has(t));
        if (!hasAnyTag) return false;
      }
      if (monthFilter && toMonthYearKey(new Date(e.date)) !== monthFilter) return false;
      if (paymentModeMismatchOnly && !mismatchedTxnIds.has(e.id)) return false;
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
    goalFilters,
    tagFilters,
    txnIdsByGoal,
    monthFilter,
    paymentModeMismatchOnly,
    mismatchedTxnIds,
    debouncedSearch,
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
    eventFilters,
    goalFilters,
    tagFilters: [...tagFilters],
    paymentModeMismatchOnly
  };

  function applyFilters(filters: FilterState) {
    setMonthFilter(filters.monthFilter);
    setTypeFilter(filters.typeFilter);
    setAccountFilters(filters.accountFilters);
    setParentCategoryFilters(filters.parentCategoryFilters);
    setCategoryFilters(filters.categoryFilters);
    setEventFilters(filters.eventFilters);
    setGoalFilters(filters.goalFilters);
    setTagFilters(new Set(filters.tagFilters));
    setPaymentModeMismatchOnly(filters.paymentModeMismatchOnly);
  }

  function clearChipFilters() {
    setTypeFilter('all');
    setAccountFilters(new Set());
    setParentCategoryFilters(new Set());
    setCategoryFilters(new Set());
    setEventFilters(new Set());
    setGoalFilters(new Set());
    setTagFilters(new Set());
    setPaymentModeMismatchOnly(false);
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
    tagFilters,
    setTagFilters,
    monthFilter,
    setMonthFilter,
    earliestMonth,
    paymentModeMismatchOnly,
    setPaymentModeMismatchOnly,
    activeFilterCount,
    filteredExpenses,
    filteredTotal,
    grouped,
    filterState,
    applyFilters,
    clearChipFilters
  };
}
