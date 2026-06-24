import { useState } from 'react';
import { SearchInput, DismissibleChip } from '@/components/ui';
import type { ActiveEvent } from '@/context/EventModeContext';
import type { Account, Expense, ExpenseCategory, Hashtag, TransactionType } from '@/core/db/types';
import { toMonthYearKey } from '@/lib/formatters';
import { monthLabel } from '@/lib/dateUtils';
import { TransactionsTab } from './TransactionsTab';
import { ExpenseForm } from './ExpenseForm';
import { FilterModal } from './FilterModal';
import { MonthPickerModal } from './MonthPickerModal';
import type { useTransactionFilters } from './useTransactionFilters';

interface TransactionsSliceProps {
  filters: ReturnType<typeof useTransactionFilters>;
  categoryMap: Map<string, ExpenseCategory>;
  accountMap: Map<string, Account>;
  accounts: Account[];
  categories: ExpenseCategory[];
  hashtags: Hashtag[];
  events: ActiveEvent[];
  pastEvents: ActiveEvent[];
  mode: 'open' | 'safe' | 'privacy';
  onSaveExpense: (e: Expense) => Promise<void>;
  onDeleteExpense: (id: string) => Promise<void>;
  onCategoryCreated: () => void;
}

export function TransactionsSlice({
  filters,
  categoryMap,
  accountMap,
  accounts,
  categories,
  hashtags,
  events,
  pastEvents,
  mode,
  onSaveExpense,
  onDeleteExpense,
  onCategoryCreated
}: TransactionsSliceProps) {
  const {
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
    grouped,
    filterState,
    applyFilters,
    clearChipFilters
  } = filters;

  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [initialTransactionType, setInitialTransactionType] = useState<TransactionType>('expense');
  const [showDial, setShowDial] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showTxnMonthPicker, setShowTxnMonthPicker] = useState(false);

  function openAdd(type: TransactionType = 'expense') {
    setInitialTransactionType(type);
    setEditingExpense(null);
    setShowDial(false);
    setShowForm(true);
  }

  function openEdit(expense: Expense) {
    setEditingExpense(expense);
    setShowForm(true);
  }

  async function handleSaveExpense(expense: Expense) {
    await onSaveExpense(expense);
    setShowForm(false);
  }

  async function handleDeleteExpense(id: string) {
    await onDeleteExpense(id);
    setShowForm(false);
  }

  const hasChipFilters =
    typeFilter !== 'all' ||
    accountFilters.size > 0 ||
    parentCategoryFilters.size > 0 ||
    categoryFilters.size > 0 ||
    eventFilters.size > 0;

  return (
    <>
      {/* Filter bar */}
      <div className="flex-shrink-0 border-b border-theme">
        <div className="flex items-center gap-2 px-4 py-2">
          <button
            onClick={() => setShowTxnMonthPicker(true)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-theme bg-surface-2 text-sm font-medium"
            style={{ color: monthFilter ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}
          >
            <i className="ti ti-calendar" style={{ fontSize: 14 }} aria-hidden="true" />
            {monthFilter ? monthLabel(monthFilter) : 'All'}
            {monthFilter && (
              <button
                onClick={(ev) => {
                  ev.stopPropagation();
                  setMonthFilter(null);
                }}
                className="ml-0.5 -mr-1"
                aria-label="Clear month filter"
              >
                <i className="ti ti-x" style={{ fontSize: 11 }} aria-hidden="true" />
              </button>
            )}
          </button>
          <SearchInput value={search} onChange={setSearch} className="flex-1" />
          <button
            onClick={() => setShowFilterSheet(true)}
            className="relative flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-theme bg-surface-2 text-secondary"
            aria-label="Open filters"
          >
            <i className="ti ti-adjustments-horizontal" style={{ fontSize: 18 }} aria-hidden="true" />
            {activeFilterCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-white font-bold"
                style={{ fontSize: 9, backgroundColor: '#ef4444' }}
              >
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {hasChipFilters && (
          <div className="flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-none">
            {typeFilter !== 'all' && (
              <DismissibleChip
                label={typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1)}
                color={typeFilter === 'expense' ? '#ef4444' : typeFilter === 'income' ? '#10b981' : '#3b82f6'}
                onDismiss={() => setTypeFilter('all')}
              />
            )}
            {(categoryFilters.size > 0 || parentCategoryFilters.size > 0) &&
              (() => {
                const catCount = categoryFilters.size;
                const parentCount = parentCategoryFilters.size;
                let label: string;
                let color = 'var(--color-primary)';
                if (catCount === 1) {
                  const cat = categoryMap.get([...categoryFilters][0] ?? '');
                  label = cat?.name ?? 'Category';
                  color = cat?.color ?? color;
                } else if (catCount > 1) {
                  label = `${catCount} categories`;
                } else if (parentCount === 1) {
                  label = [...parentCategoryFilters][0]?.replace(/_/g, ' ') ?? 'Group';
                } else {
                  label = `${parentCount} groups`;
                }
                return (
                  <DismissibleChip
                    label={label}
                    color={color}
                    onDismiss={() => {
                      setCategoryFilters(new Set());
                      setParentCategoryFilters(new Set());
                    }}
                  />
                );
              })()}
            {accountFilters.size > 0 &&
              (() => {
                const accs = [...accountFilters].map((id) => accountMap.get(id)).filter(Boolean);
                const label = accs.length === 1 ? (accs[0]?.name ?? 'Account') : `${accs.length} accounts`;
                const color = accs.length === 1 ? (accs[0]?.color ?? 'var(--color-primary)') : 'var(--color-primary)';
                return <DismissibleChip label={label} color={color} onDismiss={() => setAccountFilters(new Set())} />;
              })()}
            {eventFilters.size > 0 &&
              (() => {
                const evList = [...events, ...pastEvents].filter((ev) => eventFilters.has(ev.hashtag));
                const label = evList.length === 1 ? `#${evList[0]?.hashtag ?? ''}` : `${evList.length} events`;
                const color =
                  evList.length === 1 ? (evList[0]?.color ?? 'var(--color-primary)') : 'var(--color-primary)';
                return <DismissibleChip label={label} color={color} onDismiss={() => setEventFilters(new Set())} />;
              })()}
            <button
              onClick={clearChipFilters}
              className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ color: '#ef4444', backgroundColor: '#fef2f2' }}
            >
              <i className="ti ti-x" style={{ fontSize: 11 }} aria-hidden="true" />
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto pb-24">
        <TransactionsTab
          grouped={grouped}
          categoryMap={categoryMap}
          accountMap={accountMap}
          mode={mode}
          onEdit={openEdit}
        />
      </div>

      {/* Speed dial FAB */}
      {showDial && <div className="fixed inset-0 z-[9]" onClick={() => setShowDial(false)} aria-hidden="true" />}
      <div
        className="fixed flex flex-col items-end gap-2 z-10"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))', right: '1rem' }}
      >
        {showDial && (
          <div className="flex flex-col items-end gap-2 mb-1">
            {[
              { type: 'income' as TransactionType, label: 'Income', color: '#10b981', icon: 'ti-arrow-up-circle' },
              { type: 'transfer' as TransactionType, label: 'Transfer', color: '#3b82f6', icon: 'ti-arrows-exchange' },
              { type: 'expense' as TransactionType, label: 'Expense', color: '#ef4444', icon: 'ti-arrow-down-circle' }
            ].map(({ type: t, label, color, icon }) => (
              <button
                key={t}
                onClick={() => openAdd(t)}
                className="flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full shadow-lg text-white text-sm font-semibold"
                style={{ backgroundColor: color }}
              >
                <i className={`ti ${icon}`} style={{ fontSize: 16 }} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setShowDial((d) => !d)}
          className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white self-end"
          style={{ backgroundColor: 'var(--color-primary)' }}
          aria-label="Add transaction"
        >
          <i
            className="ti ti-plus"
            style={{ fontSize: 24, transition: 'transform 0.2s', transform: showDial ? 'rotate(45deg)' : 'none' }}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Filter modal */}
      {showFilterSheet && (
        <FilterModal
          events={events}
          pastEvents={pastEvents}
          accounts={accounts}
          categories={categories}
          initial={filterState}
          onApply={applyFilters}
          onClose={() => setShowFilterSheet(false)}
        />
      )}

      {/* Month picker */}
      {showTxnMonthPicker && (
        <MonthPickerModal
          value={monthFilter ?? toMonthYearKey()}
          onSelect={(m) => {
            setMonthFilter(m);
            setShowTxnMonthPicker(false);
          }}
          onClose={() => setShowTxnMonthPicker(false)}
          maxMonth={toMonthYearKey()}
        />
      )}

      {/* Transaction form */}
      {showForm && (
        <ExpenseForm
          categories={categories}
          hashtags={hashtags}
          editing={editingExpense}
          activeEvents={events}
          initialType={initialTransactionType}
          onSave={handleSaveExpense}
          onDelete={handleDeleteExpense}
          onCategoryCreated={onCategoryCreated}
          onClose={() => setShowForm(false)}
        />
      )}
    </>
  );
}
