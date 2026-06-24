import { useState } from 'react';
import { Modal, Button } from '@/components/ui';
import type { Account, ExpenseCategory } from '@/core/db/types';
import type { ActiveEvent } from '@/context/EventModeContext';
import { MonthPickerModal } from './MonthPickerModal';
import { monthLabel } from '@/lib/date';
import { toMonthYearKey } from '@/lib/formatters';

type TxnTypeFilter = 'all' | 'expense' | 'income' | 'transfer';

export interface FilterState {
  monthFilter: string | null;
  typeFilter: TxnTypeFilter;
  accountFilters: Set<string>;
  parentCategoryFilters: Set<string>;
  categoryFilters: Set<string>;
  eventFilters: Set<string>;
}

interface FilterModalProps {
  events: ActiveEvent[];
  pastEvents: ActiveEvent[];
  accounts: Account[];
  categories: ExpenseCategory[];
  initial: FilterState;
  onApply: (filters: FilterState) => void;
  onClose: () => void;
}

export function FilterModal({ events, pastEvents, accounts, categories, initial, onApply, onClose }: FilterModalProps) {
  const [monthFilter, setMonthFilter] = useState<string | null>(initial.monthFilter);
  const [typeFilter, setTypeFilter] = useState<TxnTypeFilter>(initial.typeFilter);
  const [accountFilters, setAccountFilters] = useState<Set<string>>(new Set(initial.accountFilters));
  const [parentCategoryFilters, setParentCategoryFilters] = useState<Set<string>>(
    new Set(initial.parentCategoryFilters)
  );
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set(initial.categoryFilters));
  const [eventFilters, setEventFilters] = useState<Set<string>>(new Set(initial.eventFilters));
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  function handleDone() {
    onApply({ monthFilter, typeFilter, accountFilters, parentCategoryFilters, categoryFilters, eventFilters });
    onClose();
  }

  function handleClear() {
    setMonthFilter(null);
    setTypeFilter('all');
    setAccountFilters(new Set());
    setParentCategoryFilters(new Set());
    setCategoryFilters(new Set());
    setEventFilters(new Set());
  }

  const intentGroupLabel: Record<string, string> = {
    daily_living: 'Daily Living',
    home_utilities: 'Home & Utilities',
    health: 'Health',
    lifestyle: 'Lifestyle',
    financial: 'Financial',
    income: 'Income',
    transfers: 'Transfers',
    other: 'Other'
  };

  const applicableGroups =
    typeFilter !== 'all'
      ? new Set(
          categories
            .filter((c) => (c.applicableTo ?? 'expense') === typeFilter)
            .map((c) => c.intentGroup)
            .filter((g): g is string => !!g)
        )
      : null;

  const allGroups = [...new Set(categories.map((c) => c.intentGroup).filter((g): g is string => !!g))].map((g) => ({
    key: g,
    label: intentGroupLabel[g] ?? g.replace(/_/g, ' ')
  }));

  const visibleCategories =
    parentCategoryFilters.size > 0
      ? categories.filter((c) => c.intentGroup && parentCategoryFilters.has(c.intentGroup))
      : categories;

  return (
    <>
      <Modal
        onClose={onClose}
        title="Filters"
        scrollable
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={handleClear}>
              Clear filters
            </Button>
            <Button variant="primary" fullWidth onClick={handleDone}>
              Done
            </Button>
          </div>
        }
      >
        {/* Month */}
        <div>
          <p className="text-xs font-medium text-secondary mb-2">Month</p>
          <button
            onClick={() => setShowMonthPicker(true)}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border border-theme bg-surface-2 text-sm font-medium text-primary text-left"
          >
            <i className="ti ti-calendar text-tertiary" style={{ fontSize: 15 }} aria-hidden="true" />
            <span className="flex-1">{monthFilter ? monthLabel(monthFilter) : 'All months'}</span>
            <i className="ti ti-chevron-right text-tertiary" style={{ fontSize: 14 }} aria-hidden="true" />
          </button>
        </div>

        {/* Type */}
        <div>
          <p className="text-xs font-medium text-secondary mb-2">Type</p>
          <div className="grid grid-cols-4 gap-2">
            {(['all', 'expense', 'income', 'transfer'] as const).map((t) => {
              const selColor: Record<string, string> = {
                all: 'var(--color-primary)',
                expense: '#ef4444',
                income: '#10b981',
                transfer: '#3b82f6'
              };
              const isSelected = typeFilter === t;
              return (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className="py-2 rounded-xl text-xs font-medium transition-colors"
                  style={
                    isSelected
                      ? { backgroundColor: selColor[t], color: '#fff' }
                      : {
                          backgroundColor: 'var(--color-surface-secondary)',
                          color: 'var(--color-text-secondary)',
                          border: '0.5px solid var(--color-border)'
                        }
                  }
                >
                  {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Event */}
        {[...events, ...pastEvents].length > 0 && (
          <div>
            <p className="text-xs font-medium text-secondary mb-2">Event</p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setEventFilters(new Set())}
                className="px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
                style={
                  eventFilters.size === 0
                    ? { backgroundColor: 'var(--color-text-primary)', color: 'var(--color-surface)' }
                    : {
                        backgroundColor: 'var(--color-surface-secondary)',
                        color: 'var(--color-text-secondary)',
                        border: '0.5px solid var(--color-border)'
                      }
                }
              >
                All events
              </button>
              {[...events, ...pastEvents].map((ev) => {
                const isSelected = eventFilters.has(ev.hashtag);
                return (
                  <button
                    key={ev.id}
                    onClick={() =>
                      setEventFilters((prev) => {
                        const next = new Set(prev);
                        if (next.has(ev.hashtag)) next.delete(ev.hashtag);
                        else next.add(ev.hashtag);
                        return next;
                      })
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
                    style={
                      isSelected
                        ? { backgroundColor: ev.color, color: '#fff' }
                        : {
                            backgroundColor: 'var(--color-surface-secondary)',
                            color: 'var(--color-text-secondary)',
                            border: '0.5px solid var(--color-border)'
                          }
                    }
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: isSelected ? '#fff' : ev.color }}
                    />
                    {ev.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Account */}
        {accounts.filter((a) => !a.isArchived).length > 0 && (
          <div>
            <p className="text-xs font-medium text-secondary mb-2">Account</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setAccountFilters(new Set())}
                className="flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors w-16"
                style={{
                  borderColor: accountFilters.size === 0 ? 'var(--color-primary)' : 'transparent',
                  backgroundColor: 'var(--color-surface-secondary)'
                }}
              >
                <i
                  className="ti ti-layout-grid"
                  style={{
                    fontSize: 18,
                    color: accountFilters.size === 0 ? 'var(--color-primary)' : 'var(--color-text-tertiary)'
                  }}
                  aria-hidden="true"
                />
                <span
                  className="text-[9px] font-medium text-center leading-tight"
                  style={{
                    color: accountFilters.size === 0 ? 'var(--color-primary)' : 'var(--color-text-secondary)'
                  }}
                >
                  All
                </span>
              </button>
              {accounts
                .filter((a) => !a.isArchived)
                .map((acc) => {
                  const isSelected = accountFilters.has(acc.id);
                  return (
                    <button
                      key={acc.id}
                      onClick={() =>
                        setAccountFilters((prev) => {
                          const next = new Set(prev);
                          if (next.has(acc.id)) next.delete(acc.id);
                          else next.add(acc.id);
                          return next;
                        })
                      }
                      className="flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors w-16"
                      style={{
                        borderColor: isSelected ? acc.color : 'transparent',
                        backgroundColor: 'var(--color-surface-secondary)'
                      }}
                    >
                      <i className={`ti ${acc.icon}`} style={{ fontSize: 18, color: acc.color }} aria-hidden="true" />
                      <span className="text-[9px] font-medium text-center leading-tight text-secondary line-clamp-2 break-words w-full">
                        {acc.name}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* Category group */}
        <div>
          <p className="text-xs font-medium text-secondary mb-2">Category group</p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                setParentCategoryFilters(new Set());
                setCategoryFilters(new Set());
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
              style={
                parentCategoryFilters.size === 0
                  ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                  : {
                      backgroundColor: 'var(--color-surface-secondary)',
                      color: 'var(--color-text-secondary)',
                      border: '0.5px solid var(--color-border)'
                    }
              }
            >
              All
            </button>
            {allGroups.map(({ key, label }) => {
              const isApplicable = applicableGroups === null || applicableGroups.has(key);
              const isSelected = parentCategoryFilters.has(key);
              return (
                <button
                  key={key}
                  onClick={() => {
                    if (!isApplicable) return;
                    setParentCategoryFilters((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    });
                    setCategoryFilters(new Set());
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
                  style={
                    isSelected
                      ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                      : isApplicable
                        ? {
                            backgroundColor: 'var(--color-surface-secondary)',
                            color: 'var(--color-text-secondary)',
                            border: '0.5px solid var(--color-border)'
                          }
                        : {
                            backgroundColor: 'var(--color-surface-secondary)',
                            color: 'var(--color-text-tertiary)',
                            border: '0.5px solid var(--color-border)',
                            opacity: 0.4,
                            cursor: 'not-allowed'
                          }
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Category */}
        <div>
          <p className="text-xs font-medium text-secondary mb-2">Category</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCategoryFilters(new Set())}
              className="flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors w-16"
              style={{
                borderColor: categoryFilters.size === 0 ? 'var(--color-primary)' : 'transparent',
                backgroundColor: 'var(--color-surface-secondary)'
              }}
            >
              <i
                className="ti ti-layout-grid"
                style={{
                  fontSize: 16,
                  color: categoryFilters.size === 0 ? 'var(--color-primary)' : 'var(--color-text-tertiary)'
                }}
                aria-hidden="true"
              />
              <span
                className="text-[8px] font-medium text-center leading-tight"
                style={{
                  color: categoryFilters.size === 0 ? 'var(--color-primary)' : 'var(--color-text-secondary)'
                }}
              >
                All
              </span>
            </button>
            {visibleCategories.map((cat) => {
              const isSelected = categoryFilters.has(cat.id);
              return (
                <button
                  key={cat.id}
                  onClick={() =>
                    setCategoryFilters((prev) => {
                      const next = new Set(prev);
                      if (next.has(cat.id)) next.delete(cat.id);
                      else next.add(cat.id);
                      return next;
                    })
                  }
                  className="flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors w-16"
                  style={{
                    borderColor: isSelected ? cat.color : 'transparent',
                    backgroundColor: 'var(--color-surface-secondary)'
                  }}
                >
                  <i className={`ti ${cat.icon}`} style={{ fontSize: 16, color: cat.color }} aria-hidden="true" />
                  <span className="text-[8px] font-medium text-center leading-tight text-secondary line-clamp-2 break-words w-full">
                    {cat.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Modal>

      {showMonthPicker && (
        <MonthPickerModal
          value={monthFilter ?? toMonthYearKey()}
          onSelect={(m) => {
            setMonthFilter(m);
            setShowMonthPicker(false);
          }}
          onClose={() => setShowMonthPicker(false)}
          maxMonth={toMonthYearKey()}
          nested
        />
      )}
    </>
  );
}
