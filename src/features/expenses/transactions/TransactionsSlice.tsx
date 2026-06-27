import { useMemo, useState } from 'react';
import { SearchInput, DismissibleChip, Button, Modal, SelectInput, ConfirmDialog } from '@/components/ui';
import { STATUS, tint } from '@/lib/statusColors';
import type { ActiveEvent } from '@/context/EventModeContext';
import type {
  Account,
  Expense,
  ExpenseCategory,
  Hashtag,
  MerchantMemory,
  Person,
  TransactionTemplate,
  TransactionType
} from '@/core/db/types';
import type { ExpenseSeedIntent } from '@/core/iou/expenseLink';
import { toMonthYearKey } from '@/lib/formatters';
import { monthLabel } from '@/lib/date';
import { TransactionsTab } from './TransactionsTab';
import { ExpenseForm } from './ExpenseForm';
import { FilterModal } from './FilterModal';
import { MonthPickerModal } from './MonthPickerModal';
import { BulkAccountPaymentModal } from './BulkAccountPaymentModal';
import { RecurringInboxModal } from './RecurringInboxModal';
import type { useTransactionFilters } from './useTransactionFilters';
import type { CategoryManager } from '../categories/types';
import type { DueRecurring } from '@/core/expenses/recurringDue';

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
  iouPersons: Person[];
  onSeedIou: (expenseId: string, intent: ExpenseSeedIntent | null) => Promise<void>;
  iouLinkByTxn: Map<string, { personName: string }>;
  onOpenBudgets: () => void;
  onPatchExpenses: (
    ids: string[],
    patch: Partial<Pick<Expense, 'categoryId' | 'accountId' | 'paymentMode'>>
  ) => Promise<void>;
  onRemoveExpenses: (ids: string[]) => Promise<void>;
  searchMerchant: (type: TransactionType, query: string) => MerchantMemory[];
  dueRecurring: DueRecurring[];
  onPostRecurring: (d: DueRecurring) => Promise<void>;
  onSkipRecurring: (d: DueRecurring) => void;
  templates: TransactionTemplate[];
  onSaveTemplate: (t: Omit<TransactionTemplate, 'id' | 'createdAt'>) => Promise<void> | void;
  onRemoveTemplate: (id: string) => Promise<void> | void;
  categoryManager: CategoryManager;
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
  iouPersons,
  onSeedIou,
  iouLinkByTxn,
  onOpenBudgets,
  onPatchExpenses,
  onRemoveExpenses,
  searchMerchant,
  dueRecurring,
  onPostRecurring,
  onSkipRecurring,
  templates,
  onSaveTemplate,
  onRemoveTemplate,
  categoryManager
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
  const [prefill, setPrefill] = useState<Partial<Expense> | null>(null);
  const [initialTransactionType, setInitialTransactionType] = useState<TransactionType>('expense');
  const [showDial, setShowDial] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showTxnMonthPicker, setShowTxnMonthPicker] = useState(false);
  const [showInbox, setShowInbox] = useState(false);

  // ── Multi-select / bulk operations ──
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkCategory, setShowBulkCategory] = useState(false);
  const [bulkCategoryTarget, setBulkCategoryTarget] = useState('');
  const [showAcctPay, setShowAcctPay] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const allFilteredIds = useMemo(() => grouped.flatMap((g) => g.items.map((i) => i.id)), [grouped]);
  const categoryOptions = useMemo(
    () => categories.filter((c) => !c.isGroup).map((c) => ({ value: c.id, label: c.name })),
    [categories]
  );

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function enterSelect() {
    setShowDial(false);
    setSelectMode(true);
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function applyBulkPatch(patch: Partial<Pick<Expense, 'categoryId' | 'accountId' | 'paymentMode'>>) {
    if (selected.size === 0) return;
    await onPatchExpenses([...selected], patch);
    exitSelect();
  }

  async function handleBulkCategory() {
    if (!bulkCategoryTarget) return;
    setBulkBusy(true);
    try {
      await applyBulkPatch({ categoryId: bulkCategoryTarget });
      setShowBulkCategory(false);
      setBulkCategoryTarget('');
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkDelete() {
    setBulkBusy(true);
    try {
      await onRemoveExpenses([...selected]);
      setConfirmBulkDelete(false);
      exitSelect();
    } finally {
      setBulkBusy(false);
    }
  }

  function openAdd(type: TransactionType = 'expense') {
    setInitialTransactionType(type);
    setEditingExpense(null);
    setPrefill(null);
    setShowDial(false);
    setShowForm(true);
  }

  /** Open Add prefilled from a duplicate or a saved template. */
  function openPrefilled(p: Partial<Expense>) {
    setEditingExpense(null);
    setPrefill(p);
    setInitialTransactionType(p.type ?? 'expense');
    setShowDial(false);
    setShowForm(true);
  }

  function handleDuplicate(e: Expense) {
    const { id: _id, createdAt: _c, updatedAt: _u, date: _d, ...rest } = e;
    void _id;
    void _c;
    void _u;
    void _d;
    openPrefilled(rest);
  }

  function applyTemplate(t: TransactionTemplate) {
    openPrefilled({
      type: t.type,
      description: t.description,
      categoryId: t.categoryId,
      ...(t.amount !== undefined && { amount: t.amount }),
      ...(t.accountId && { accountId: t.accountId }),
      ...(t.paymentMode && { paymentMode: t.paymentMode })
    });
  }

  function openEdit(expense: Expense) {
    setPrefill(null);
    setEditingExpense(expense);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setPrefill(null);
  }

  async function handleSaveExpense(expense: Expense) {
    await onSaveExpense(expense);
    closeForm();
  }

  async function handleDeleteExpense(id: string) {
    await onDeleteExpense(id);
    closeForm();
  }

  const hasChipFilters =
    typeFilter !== 'all' ||
    accountFilters.size > 0 ||
    parentCategoryFilters.size > 0 ||
    categoryFilters.size > 0 ||
    eventFilters.size > 0;

  return (
    <>
      {/* Selection header (select mode) */}
      {selectMode ? (
        <div className="flex-shrink-0 border-b border-theme flex items-center justify-between px-4 py-2.5">
          <button onClick={exitSelect} className="text-sm font-medium text-secondary">
            Cancel
          </button>
          <span className="text-sm font-semibold text-primary">{selected.size} selected</span>
          <button
            onClick={() => setSelected(selected.size === allFilteredIds.length ? new Set() : new Set(allFilteredIds))}
            className="text-sm font-medium"
            style={{ color: 'var(--color-primary)' }}
          >
            {selected.size === allFilteredIds.length && allFilteredIds.length > 0 ? 'Clear' : 'Select all'}
          </button>
        </div>
      ) : (
        /* Filter bar */
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
            <SearchInput value={search} onChange={setSearch} className="flex-1 min-w-0" />
            <button
              onClick={() => setShowFilterSheet(true)}
              className="relative flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-theme bg-surface-2 text-secondary"
              aria-label="Open filters"
            >
              <i className="ti ti-adjustments-horizontal" style={{ fontSize: 18 }} aria-hidden="true" />
              {activeFilterCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ fontSize: 9, backgroundColor: STATUS.danger }}
                >
                  {activeFilterCount}
                </span>
              )}
            </button>
            <button
              onClick={enterSelect}
              disabled={allFilteredIds.length === 0}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-theme bg-surface-2 text-secondary disabled:opacity-40"
              aria-label="Select transactions"
            >
              <i className="ti ti-list-check" style={{ fontSize: 18 }} aria-hidden="true" />
            </button>
            <button
              onClick={onOpenBudgets}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-theme bg-surface-2 text-secondary"
              aria-label="Open budgets"
            >
              <i className="ti ti-target-arrow" style={{ fontSize: 18 }} aria-hidden="true" />
            </button>
          </div>

          {hasChipFilters && (
            <div className="flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-none">
              {typeFilter !== 'all' && (
                <DismissibleChip
                  label={typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1)}
                  color={
                    typeFilter === 'expense' ? STATUS.danger : typeFilter === 'income' ? STATUS.success : STATUS.info
                  }
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
                style={{ color: STATUS.danger, backgroundColor: tint(STATUS.danger) }}
              >
                <i className="ti ti-x" style={{ fontSize: 11 }} aria-hidden="true" />
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* Saved templates — one-tap quick add */}
      {!selectMode && templates.length > 0 && (
        <div className="flex-shrink-0 flex gap-2 overflow-x-auto px-4 py-2 border-b border-theme scrollbar-none">
          {templates.map((t) => (
            <span
              key={t.id}
              className="flex-shrink-0 flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-surface-2 border border-theme"
            >
              <button
                onClick={() => applyTemplate(t)}
                className="text-xs font-medium text-primary flex items-center gap-1"
              >
                <i className="ti ti-star" style={{ fontSize: 12, color: 'var(--color-primary)' }} aria-hidden="true" />
                {t.label}
              </button>
              <button
                onClick={() => void onRemoveTemplate(t.id)}
                className="w-4 h-4 flex items-center justify-center rounded-full text-tertiary hover:text-primary"
                aria-label={`Remove template ${t.label}`}
              >
                <i className="ti ti-x" style={{ fontSize: 11 }} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Recurring "due to log" inbox banner */}
      {!selectMode && dueRecurring.length > 0 && (
        <button
          onClick={() => setShowInbox(true)}
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-theme text-left"
          style={{ backgroundColor: tint(STATUS.info) }}
        >
          <i className="ti ti-clock-bolt" style={{ fontSize: 18, color: STATUS.info }} aria-hidden="true" />
          <span className="flex-1 text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {dueRecurring.length} recurring {dueRecurring.length === 1 ? 'item' : 'items'} due to log
          </span>
          <span className="text-xs font-semibold" style={{ color: STATUS.info }}>
            Review
          </span>
        </button>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto pb-24 bg-surface-3">
        <TransactionsTab
          grouped={grouped}
          categoryMap={categoryMap}
          accountMap={accountMap}
          mode={mode}
          onEdit={openEdit}
          onDelete={onDeleteExpense}
          onDuplicate={handleDuplicate}
          selectMode={selectMode}
          selectedIds={selected}
          onToggleSelect={toggleSelect}
        />
      </div>

      {/* Bulk action bar (select mode) */}
      {selectMode && selected.size > 0 && (
        <div
          className="fixed left-0 right-0 z-20 grid grid-cols-3 gap-1 px-2 py-2 border-t border-theme bg-surface max-w-[430px] mx-auto"
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            onClick={() => {
              setBulkCategoryTarget('');
              setShowBulkCategory(true);
            }}
            className="flex flex-col items-center gap-1 py-2 rounded-xl text-secondary hover:bg-surface-2"
          >
            <i className="ti ti-tag" style={{ fontSize: 19 }} aria-hidden="true" />
            <span className="text-[10px] font-medium">Category</span>
          </button>
          <button
            onClick={() => setShowAcctPay(true)}
            className="flex flex-col items-center gap-1 py-2 rounded-xl text-secondary hover:bg-surface-2"
          >
            <i className="ti ti-wallet" style={{ fontSize: 19 }} aria-hidden="true" />
            <span className="text-[10px] font-medium">Account/Pay</span>
          </button>
          <button
            onClick={() => setConfirmBulkDelete(true)}
            className="flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-surface-2"
            style={{ color: STATUS.danger }}
          >
            <i className="ti ti-trash" style={{ fontSize: 19 }} aria-hidden="true" />
            <span className="text-[10px] font-medium">Delete</span>
          </button>
        </div>
      )}

      {/* Speed dial FAB (hidden in select mode) */}
      {!selectMode && showDial && (
        <div className="fixed inset-0 z-[9]" onClick={() => setShowDial(false)} aria-hidden="true" />
      )}
      {!selectMode && (
        <div
          className="fixed flex flex-col items-end gap-2 z-10"
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))', right: '1rem' }}
        >
          {showDial && (
            <div className="flex flex-col items-end gap-2 mb-1">
              {[
                { type: 'income' as TransactionType, label: 'Income', color: '#10b981', icon: 'ti-arrow-up-circle' },
                {
                  type: 'transfer' as TransactionType,
                  label: 'Transfer',
                  color: '#3b82f6',
                  icon: 'ti-arrows-exchange'
                },
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
      )}

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
          prefill={prefill}
          activeEvents={events}
          initialType={initialTransactionType}
          onSave={handleSaveExpense}
          onDelete={handleDeleteExpense}
          iouPersons={iouPersons}
          onSeedIou={onSeedIou}
          linkedIou={editingExpense ? iouLinkByTxn.get(editingExpense.id) : undefined}
          searchMerchant={searchMerchant}
          onDuplicate={handleDuplicate}
          onSaveTemplate={onSaveTemplate}
          categoryManager={categoryManager}
          onClose={closeForm}
        />
      )}

      {/* Recurring "due to log" inbox */}
      {showInbox && (
        <RecurringInboxModal
          due={dueRecurring}
          categoryMap={categoryMap}
          onPost={onPostRecurring}
          onSkip={onSkipRecurring}
          onClose={() => setShowInbox(false)}
        />
      )}

      {/* Bulk: move to category */}
      {showBulkCategory && (
        <Modal
          nested
          size="sm"
          onClose={() => setShowBulkCategory(false)}
          title="Move to category"
          footer={
            <div className="flex gap-3">
              <Button variant="secondary" fullWidth onClick={() => setShowBulkCategory(false)} disabled={bulkBusy}>
                Cancel
              </Button>
              <Button
                fullWidth
                disabled={!bulkCategoryTarget}
                loading={bulkBusy}
                onClick={() => void handleBulkCategory()}
              >
                Move
              </Button>
            </div>
          }
        >
          <p className="text-sm text-secondary">
            Move {selected.size} transaction{selected.size === 1 ? '' : 's'} to:
          </p>
          <SelectInput
            value={bulkCategoryTarget}
            onChange={setBulkCategoryTarget}
            placeholder="Choose category…"
            options={categoryOptions}
          />
        </Modal>
      )}

      {/* Bulk: account + payment mode (coupled) */}
      {showAcctPay && (
        <BulkAccountPaymentModal
          accounts={accounts}
          count={selected.size}
          onAddAccount={() => setShowAcctPay(false)}
          onApply={async (patch) => {
            await applyBulkPatch(patch);
            setShowAcctPay(false);
          }}
          onClose={() => setShowAcctPay(false)}
        />
      )}

      <ConfirmDialog
        isOpen={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={() => void handleBulkDelete()}
        title="Delete transactions"
        message={`Delete ${selected.size} transaction${selected.size === 1 ? '' : 's'}? This cannot be undone.`}
        confirmLabel="Delete"
        loading={bulkBusy}
      />
    </>
  );
}
