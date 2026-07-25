import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchInput, DismissibleChip, Button, Modal, SelectInput, ConfirmDialog } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import type { ActiveEvent } from '~/context/EventModeContext';
import type {
  Account,
  Expense,
  ExpenseCategory,
  GroupType,
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
import { ShareToGroupModal } from './ShareToGroupModal';
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
  /** Resolves Safe/Privacy/Open masking for a given item's sensitivity (e.g. a category's `hideInSafeMode`). */
  shouldMask: (sensitive: boolean | undefined) => boolean;
  onSaveExpense: (e: Expense, newTagSetAside?: Record<string, boolean>) => Promise<void>;
  onDeleteExpense: (id: string) => Promise<void>;
  iouPersons: Person[];
  onSeedIou: (expenseId: string, intent: ExpenseSeedIntent | null) => Promise<void>;
  iouLinkByTxn: Map<string, { personName: string }>;
  accountBalances: Record<string, number>;
  shareGroups: { id: string; name: string; type: GroupType }[];
  onShareToGroup: (expense: Expense, groupId: string, participants?: string[]) => Promise<void>;
  /** Share-later (Track E): shares an existing transaction into a group and marks it as shared. */
  onShareLater: (expense: Expense, groupId: string) => Promise<void>;
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

/**
 * RN port of apps/web-legacy/src/features/expenses/transactions/TransactionsSlice.tsx. Groups is now
 * ported — this restores web's `shareGroups`/`onShareToGroup`/`onShareLater`/`sharingExpense` (the
 * "Share with a group" swipe action + `ShareToGroupModal`), previously dropped here.
 */
export function TransactionsSlice({
  filters,
  categoryMap,
  accountMap,
  accounts,
  categories,
  hashtags,
  events,
  pastEvents,
  shouldMask,
  onSaveExpense,
  onDeleteExpense,
  iouPersons,
  onSeedIou,
  iouLinkByTxn,
  accountBalances,
  shareGroups,
  onShareToGroup,
  onShareLater,
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
  const theme = useThemeColors();
  const insets = useSafeAreaInsets();
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
  const [sharingExpense, setSharingExpense] = useState<Expense | null>(null);
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

  async function handleSaveExpense(expense: Expense, newTagSetAside?: Record<string, boolean>) {
    await onSaveExpense(expense, newTagSetAside);
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

  const DIAL_OPTIONS: { type: TransactionType; label: string; color: string; icon: string }[] = [
    { type: 'income', label: 'Income', color: theme.success, icon: 'ti-arrow-up-circle' },
    { type: 'transfer', label: 'Transfer', color: theme.info, icon: 'ti-arrows-exchange' },
    { type: 'expense', label: 'Expense', color: theme.danger, icon: 'ti-arrow-down-circle' }
  ];

  return (
    <View className="flex-1">
      {/* Selection header (select mode) */}
      {selectMode ? (
        <View className="border-b border-theme flex-row items-center justify-between px-4 py-2.5">
          <Pressable onPress={exitSelect}>
            <Text className="text-sm font-medium text-secondary">Cancel</Text>
          </Pressable>
          <Text className="text-sm font-semibold text-primary">{selected.size} selected</Text>
          <Pressable
            onPress={() => setSelected(selected.size === allFilteredIds.length ? new Set() : new Set(allFilteredIds))}
          >
            <Text className="text-sm font-medium" style={{ color: theme.primary }}>
              {selected.size === allFilteredIds.length && allFilteredIds.length > 0 ? 'Clear' : 'Select all'}
            </Text>
          </Pressable>
        </View>
      ) : (
        /* Filter bar */
        <View className="border-b border-theme">
          <View className="flex-row items-center gap-2 px-4 py-2">
            <Pressable
              onPress={() => setShowTxnMonthPicker(true)}
              className="shrink-0 flex-row items-center gap-1.5 px-3 py-2 rounded-xl border border-theme bg-surface-2"
            >
              <Icon name="ti-calendar" size={14} color={monthFilter ? theme.primary : theme.textSecondary} />
              <Text
                className="text-sm font-medium"
                style={{ color: monthFilter ? theme.primary : theme.textSecondary }}
              >
                {monthFilter ? monthLabel(monthFilter) : 'All'}
              </Text>
              {monthFilter && (
                <Pressable
                  onPress={() => setMonthFilter(null)}
                  className="ml-0.5"
                  accessibilityLabel="Clear month filter"
                >
                  <Icon name="ti-x" size={11} color={theme.textSecondary} />
                </Pressable>
              )}
            </Pressable>
            <SearchInput value={search} onChange={setSearch} className="flex-1 min-w-0" />
            <Pressable
              onPress={() => setShowFilterSheet(true)}
              className="relative shrink-0 w-9 h-9 items-center justify-center rounded-xl border border-theme bg-surface-2"
              accessibilityLabel="Open filters"
            >
              <Icon name="ti-adjustments-horizontal" size={18} color={theme.textSecondary} />
              {activeFilterCount > 0 && (
                <View
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full items-center justify-center"
                  style={{ backgroundColor: theme.danger }}
                >
                  <Text className="text-[9px] font-bold text-white">{activeFilterCount}</Text>
                </View>
              )}
            </Pressable>
            <Pressable
              onPress={enterSelect}
              disabled={allFilteredIds.length === 0}
              className="shrink-0 w-9 h-9 items-center justify-center rounded-xl border border-theme bg-surface-2"
              style={{ opacity: allFilteredIds.length === 0 ? 0.4 : 1 }}
              accessibilityLabel="Select transactions"
            >
              <Icon name="ti-list-check" size={18} color={theme.textSecondary} />
            </Pressable>
            <Pressable
              onPress={onOpenBudgets}
              className="shrink-0 w-9 h-9 items-center justify-center rounded-xl border border-theme bg-surface-2"
              accessibilityLabel="Open budgets"
            >
              <Icon name="ti-target-arrow" size={18} color={theme.textSecondary} />
            </Pressable>
          </View>

          {hasChipFilters && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}
            >
              {typeFilter !== 'all' && (
                <DismissibleChip
                  label={typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1)}
                  color={typeFilter === 'expense' ? theme.danger : typeFilter === 'income' ? theme.success : theme.info}
                  onDismiss={() => setTypeFilter('all')}
                />
              )}
              {(categoryFilters.size > 0 || parentCategoryFilters.size > 0) &&
                (() => {
                  const catCount = categoryFilters.size;
                  const parentCount = parentCategoryFilters.size;
                  let label: string;
                  let color = theme.primary;
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
                  const color = accs.length === 1 ? (accs[0]?.color ?? theme.primary) : theme.primary;
                  return <DismissibleChip label={label} color={color} onDismiss={() => setAccountFilters(new Set())} />;
                })()}
              {eventFilters.size > 0 &&
                (() => {
                  const evList = [...events, ...pastEvents].filter((ev) => eventFilters.has(ev.hashtag));
                  const label = evList.length === 1 ? `#${evList[0]?.hashtag ?? ''}` : `${evList.length} events`;
                  const color = evList.length === 1 ? (evList[0]?.color ?? theme.primary) : theme.primary;
                  return <DismissibleChip label={label} color={color} onDismiss={() => setEventFilters(new Set())} />;
                })()}
              <Pressable
                onPress={clearChipFilters}
                className="shrink-0 flex-row items-center gap-1 px-3 py-1.5 rounded-full"
                style={{ backgroundColor: tint(theme.danger) }}
              >
                <Icon name="ti-x" size={11} color={theme.danger} />
                <Text className="text-xs font-medium" style={{ color: theme.danger }}>
                  Clear all
                </Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      )}

      {/* Saved templates — one-tap quick add */}
      {!selectMode && templates.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="border-b border-theme"
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}
        >
          {templates.map((t) => (
            <View
              key={t.id}
              className="shrink-0 flex-row items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-surface-2 border border-theme"
            >
              <Pressable onPress={() => applyTemplate(t)} className="flex-row items-center gap-1">
                <Icon name="ti-star" size={12} color={theme.primary} />
                <Text className="text-xs font-medium text-primary">{t.label}</Text>
              </Pressable>
              <Pressable
                onPress={() => void onRemoveTemplate(t.id)}
                className="w-4 h-4 items-center justify-center rounded-full"
                accessibilityLabel={`Remove template ${t.label}`}
              >
                <Icon name="ti-x" size={11} color={theme.textTertiary} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Recurring "due to log" inbox banner */}
      {!selectMode && dueRecurring.length > 0 && (
        <Pressable
          onPress={() => setShowInbox(true)}
          className="flex-row items-center gap-2 px-4 py-2.5 border-b border-theme"
          style={{ backgroundColor: tint(theme.info) }}
        >
          <Icon name="ti-clock-bolt" size={18} color={theme.info} />
          <Text className="flex-1 text-sm font-medium text-primary">
            {dueRecurring.length} recurring {dueRecurring.length === 1 ? 'item' : 'items'} due to log
          </Text>
          <Text className="text-xs font-semibold" style={{ color: theme.info }}>
            Review
          </Text>
        </Pressable>
      )}

      {/* List — SectionList owns its own scroll/virtualization (see TransactionsTab.tsx) */}
      <TransactionsTab
        grouped={grouped}
        categoryMap={categoryMap}
        accountMap={accountMap}
        hashtags={hashtags}
        shouldMask={shouldMask}
        onEdit={openEdit}
        onDelete={onDeleteExpense}
        onDuplicate={handleDuplicate}
        onShare={shareGroups.length > 0 ? setSharingExpense : undefined}
        selectMode={selectMode}
        selectedIds={selected}
        onToggleSelect={toggleSelect}
      />

      {/* Bulk action bar (select mode) */}
      {selectMode && selected.size > 0 && (
        <View
          className="absolute left-0 right-0 flex-row flex-wrap gap-1 px-2 py-2 border-t border-theme bg-surface"
          style={{ bottom: insets.bottom }}
        >
          <Pressable
            onPress={() => {
              setBulkCategoryTarget('');
              setShowBulkCategory(true);
            }}
            className="items-center gap-1 py-2 rounded-xl"
            style={{ flexBasis: '33%', flexGrow: 1 }}
          >
            <Icon name="ti-tag" size={19} color={theme.textSecondary} />
            <Text className="text-[10px] font-medium text-secondary">Category</Text>
          </Pressable>
          <Pressable
            onPress={() => setShowAcctPay(true)}
            className="items-center gap-1 py-2 rounded-xl"
            style={{ flexBasis: '33%', flexGrow: 1 }}
          >
            <Icon name="ti-wallet" size={19} color={theme.textSecondary} />
            <Text className="text-[10px] font-medium text-secondary">Account/Pay</Text>
          </Pressable>
          <Pressable
            onPress={() => setConfirmBulkDelete(true)}
            className="items-center gap-1 py-2 rounded-xl"
            style={{ flexBasis: '33%', flexGrow: 1 }}
          >
            <Icon name="ti-trash" size={19} color={theme.danger} />
            <Text className="text-[10px] font-medium" style={{ color: theme.danger }}>
              Delete
            </Text>
          </Pressable>
        </View>
      )}

      {/* Speed dial FAB (hidden in select mode). Positioned `absolute` as a sibling of the list's own
          ScrollView (not inside it) — the same "Slice owns its scroll + its FAB" placement already
          proven by IouView, which is embedded the same way (standalone page AND an Expenses tab slice)
          and reads `useSafeAreaInsets` directly rather than relying on an ancestor Stack.Navigator/page
          header, since that context is available anywhere under the root SafeAreaProvider. */}
      {!selectMode && showDial && (
        <Pressable
          onPress={() => setShowDial(false)}
          className="absolute inset-0"
          accessibilityLabel="Dismiss add menu"
        />
      )}
      {!selectMode && (
        <View className="absolute items-end gap-2" style={{ bottom: insets.bottom + 16, right: 16 }}>
          {showDial && (
            <View className="items-end gap-2 mb-1">
              {DIAL_OPTIONS.map(({ type: t, label, color, icon }) => (
                <Pressable
                  key={t}
                  onPress={() => openAdd(t)}
                  className="flex-row items-center gap-2 pl-3 pr-4 py-2.5 rounded-full shadow-lg"
                  style={{ backgroundColor: color }}
                >
                  <Icon name={icon} size={16} color="#fff" />
                  <Text className="text-sm font-semibold text-white">{label}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <Pressable
            onPress={() => setShowDial((d) => !d)}
            className="w-14 h-14 rounded-full shadow-lg items-center justify-center"
            style={{ backgroundColor: theme.primary }}
            accessibilityLabel="Add transaction"
          >
            <Icon name="ti-plus" size={24} color="#fff" />
          </Pressable>
        </View>
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
          accountBalances={accountBalances}
          shareGroups={shareGroups}
          onShareToGroup={onShareToGroup}
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

      {/* Share-later picker (Track E) */}
      {sharingExpense && shareGroups.length > 0 && (
        <ShareToGroupModal
          expense={sharingExpense}
          groups={shareGroups}
          onShare={onShareLater}
          onClose={() => setSharingExpense(null)}
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
          size="sm"
          onClose={() => setShowBulkCategory(false)}
          title="Move to category"
          footer={
            <View className="flex-row gap-3">
              <Button variant="secondary" fullWidth onPress={() => setShowBulkCategory(false)} disabled={bulkBusy}>
                Cancel
              </Button>
              <Button
                fullWidth
                disabled={!bulkCategoryTarget}
                loading={bulkBusy}
                onPress={() => void handleBulkCategory()}
              >
                Move
              </Button>
            </View>
          }
        >
          <Text className="text-sm text-secondary">
            Move {selected.size} transaction{selected.size === 1 ? '' : 's'} to:
          </Text>
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
        message={`Delete ${selected.size} transaction${selected.size === 1 ? '' : 's'}? You can undo right after.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={bulkBusy}
      />
    </View>
  );
}
