import { useCallback, useMemo, useState } from 'react';
import { View, Pressable, ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchInput, DismissibleChip, ConfirmDialog } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import type { ActiveEvent } from '~/context/EventModeContext';
import type {
  Account,
  Expense,
  ExpenseCategory,
  Goal,
  GroupType,
  Hashtag,
  MerchantMemory,
  Person,
  TransactionTemplate,
  TransactionType
} from '@/core/db/types';
import type { ExpenseSeedIntent } from '@/core/iou/expenseLink';
import type { ExpenseGoalIntent } from '@/core/goals/goalLink';
import type { AccountInput } from '~/hooks/useAccountForm';
import { toMonthYearKey } from '@/lib/formatters';
import { monthLabel } from '@/lib/date';
import { TransactionsTab } from './TransactionsTab';
import { ExpenseForm } from '~/components/shared/ExpenseForm';
import { CategoryPickerModal } from '../categories/CategoryPickerModal';
import { FilterModal } from './FilterModal';
import { MonthPickerModal } from './MonthPickerModal';
import { BulkAccountPaymentModal } from './BulkAccountPaymentModal';
import { BulkHashtagModal } from './BulkHashtagModal';
import { RecurringInboxModal } from './RecurringInboxModal';
import { ShareToGroupModal } from './ShareToGroupModal';
import type { useTransactionFilters } from './useTransactionFilters';
import type { CategoryManager } from '../categories/types';
import type { DueRecurring } from '@/core/expenses/recurringDue';

interface TransactionsSliceProps {
  /** True only during the initial decrypt-on-load — see `useExpenses.ts` — so the list can show a real
   *  loading state instead of a misleading "No transactions yet" empty state while data is still arriving. */
  loading: boolean;
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
  goals: Goal[];
  onSeedGoal: (expenseId: string, intent: ExpenseGoalIntent | null) => Promise<void>;
  goalLinkByTxn: Map<string, { goalId: string; goalName: string }>;
  goalLinkedTxnIds: Set<string>;
  /** For the edit form's "matched from bank statement" audit-trail caption (docs/plans/
   *  bank-statement-import.md §10a's purpose #1) — which transactions were resolved from a bank
   *  statement import, and what the original line(s) looked like. An array per transaction since
   *  2026-08-09 — a cross-account transfer absorbed via `linkAsCrossAccountTransfer` carries one linked
   *  line per side. */
  bankImportLinkByTxn: Map<string, { rawNarration: string; date: number }[]>;
  /** Every transaction whose recorded payment mode disagrees with its original bank-statement
   *  narration (2026-08-06, `useExpenses.ts`'s `paymentModeMismatchTxnIds`) — drives both the row
   *  warning icon (`TransactionsTab`) and the "Payment mode mismatch" filter toggle. */
  paymentModeMismatchTxnIds: Set<string>;
  /** Adds/edits an account from the expense form's own "+" tile (`AccountChips.tsx`), inline. */
  saveAccount: (data: AccountInput, editing: Account | null) => Promise<Account>;
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
  /** Additive-only bulk tag (2026-08-16) — adds `tag` to every selected transaction's existing tags,
   *  never replaces them. See `BulkHashtagModal`'s own doc comment. */
  onBulkAddHashtag: (ids: string[], tag: string) => Promise<void>;
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
 * RN port of apps/web-react/src/features/expenses/transactions/TransactionsSlice.tsx. Groups is now
 * ported — this restores web's `shareGroups`/`onShareToGroup`/`onShareLater`/`sharingExpense` (the
 * "Share with a group" swipe action + `ShareToGroupModal`), previously dropped here.
 */
export function TransactionsSlice({
  loading,
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
  goals,
  onSeedGoal,
  goalLinkByTxn,
  goalLinkedTxnIds,
  bankImportLinkByTxn,
  paymentModeMismatchTxnIds,
  saveAccount,
  accountBalances,
  shareGroups,
  onShareToGroup,
  onShareLater,
  onOpenBudgets,
  onPatchExpenses,
  onRemoveExpenses,
  onBulkAddHashtag,
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
    paymentModeMismatchOnly,
    setPaymentModeMismatchOnly,
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
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showTxnMonthPicker, setShowTxnMonthPicker] = useState(false);
  const [showInbox, setShowInbox] = useState(false);

  // ── Multi-select / bulk operations ──
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkCategory, setShowBulkCategory] = useState(false);
  const [showAcctPay, setShowAcctPay] = useState(false);
  const [showBulkHashtag, setShowBulkHashtag] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const allFilteredIds = useMemo(() => grouped.flatMap((g) => g.items.map((i) => i.id)), [grouped]);
  // A bulk selection is overwhelmingly one direction in practice — pick whichever the majority of the
  // selected rows actually are, same majority-vote approach `BulkCategorizeModal.tsx` (bank-import) uses
  // for its own picker-type, so `CategoryPickerModal`'s expense/income category filtering is right for
  // the common case even for a mixed selection.
  //
  // Guarded on `showBulkCategory` (only actually used while that modal is open) rather than computed
  // unconditionally — this used to flatten + filter the ENTIRE filtered dataset (up to all 4,000+ rows)
  // on every change to `selected`, i.e. on every single row tap, select-all, or clear (found 2026-08-14).
  // React still re-invokes this factory whenever `selected`/`grouped` changes (they're still real deps),
  // but the early return means that's an O(1) check on every one of those — the real O(selected size) scan
  // only happens when the modal is actually open (bounded by how often the user opens/re-triggers the
  // bulk-category picker, not by every selection change).
  const bulkPickerType: 'expense' | 'income' = useMemo(() => {
    if (!showBulkCategory) return 'expense';
    const selectedExpenses = grouped.flatMap((g) => g.items).filter((e) => selected.has(e.id));
    const incomeCount = selectedExpenses.filter((e) => e.type === 'income').length;
    return incomeCount > selectedExpenses.length / 2 ? 'income' : 'expense';
  }, [showBulkCategory, grouped, selected]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function enterSelect() {
    setSelectMode(true);
  }

  /** Long-pressing a row in normal mode — enters select mode with that row already selected, same
   *  end state as tapping the select icon then tapping the row, in one gesture. */
  const handleLongPressSelect = useCallback((id: string) => {
    setSelectMode(true);
    setSelected(new Set([id]));
  }, []);

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function applyBulkPatch(patch: Partial<Pick<Expense, 'categoryId' | 'accountId' | 'paymentMode'>>) {
    if (selected.size === 0) return;
    await onPatchExpenses([...selected], patch);
    exitSelect();
  }

  async function handleBulkCategory(categoryId: string) {
    setBulkBusy(true);
    try {
      await applyBulkPatch({ categoryId });
    } finally {
      setBulkBusy(false);
      setShowBulkCategory(false);
    }
  }

  async function handleBulkHashtag(tag: string) {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      await onBulkAddHashtag([...selected], tag);
      exitSelect();
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
    setShowForm(true);
  }

  /** Open Add prefilled from a duplicate or a saved template. */
  const openPrefilled = useCallback((p: Partial<Expense>) => {
    setEditingExpense(null);
    setPrefill(p);
    setInitialTransactionType(p.type ?? 'expense');
    setShowForm(true);
  }, []);

  const handleDuplicate = useCallback(
    (e: Expense) => {
      const { id: _id, createdAt: _c, updatedAt: _u, date: _d, ...rest } = e;
      void _id;
      void _c;
      void _u;
      void _d;
      openPrefilled(rest);
    },
    [openPrefilled]
  );

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

  const openEdit = useCallback((expense: Expense) => {
    setPrefill(null);
    setEditingExpense(expense);
    setShowForm(true);
  }, []);

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
    eventFilters.size > 0 ||
    paymentModeMismatchOnly;

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
              {paymentModeMismatchOnly && (
                <DismissibleChip
                  label="Payment mismatch"
                  color={theme.warning}
                  onDismiss={() => setPaymentModeMismatchOnly(false)}
                />
              )}
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

      {/* List — FlashList owns its own scroll/virtualization (see TransactionsTab.tsx) */}
      <TransactionsTab
        loading={loading}
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
        onLongPressSelect={handleLongPressSelect}
        goalLinkedTxnIds={goalLinkedTxnIds}
        paymentModeMismatchTxnIds={paymentModeMismatchTxnIds}
      />

      {/* Bulk action bar (select mode). Each Pressable is a plain `flex: 1` — the previous
          `flexBasis: '33%'` didn't account for the row's own `gap`/`px` overhead, so the items'
          combined width exceeded the container and `flex-wrap` pushed the last icon onto its own row
          (found 2026-08-05). `flex: 1` always sums to exactly the available width, so wrap never
          triggers regardless of gap/padding — holds for 4 icons the same as it did for 3.
          Hashtag added 2026-08-16 (real user report: "assigning bulk tag to the selected ones should
          also be there") — before Delete, same position CategoryPickerModal/BulkAccountPaymentModal's
          own icons occupy relative to the destructive action staying last. */}
      {selectMode && selected.size > 0 && (
        <View
          className="absolute left-0 right-0 flex-row gap-1 px-2 py-2 border-t border-theme bg-surface"
          style={{ bottom: insets.bottom }}
        >
          <Pressable
            onPress={() => setShowBulkCategory(true)}
            className="items-center gap-1 py-2 rounded-xl"
            style={{ flex: 1 }}
          >
            <Icon name="ti-tag" size={19} color={theme.textSecondary} />
            <Text className="text-[10px] font-medium text-secondary">Category</Text>
          </Pressable>
          <Pressable
            onPress={() => setShowAcctPay(true)}
            className="items-center gap-1 py-2 rounded-xl"
            style={{ flex: 1 }}
          >
            <Icon name="ti-wallet" size={19} color={theme.textSecondary} />
            <Text className="text-[10px] font-medium text-secondary">Account/Pay</Text>
          </Pressable>
          <Pressable
            onPress={() => setShowBulkHashtag(true)}
            className="items-center gap-1 py-2 rounded-xl"
            style={{ flex: 1 }}
          >
            <Icon name="ti-hash" size={19} color={theme.textSecondary} />
            <Text className="text-[10px] font-medium text-secondary">Hashtag</Text>
          </Pressable>
          <Pressable
            onPress={() => setConfirmBulkDelete(true)}
            className="items-center gap-1 py-2 rounded-xl"
            style={{ flex: 1 }}
          >
            <Icon name="ti-trash" size={19} color={theme.danger} />
            <Text className="text-[10px] font-medium" style={{ color: theme.danger }}>
              Delete
            </Text>
          </Pressable>
        </View>
      )}

      {/* FAB (hidden in select mode). Opens the form directly, defaulted to Expense — the intermediate
          Expense/Income/Transfer speed-dial step was removed (2026-08-01, cut 2 taps to 1) since the
          form itself already has that exact switcher at the top; switch type there instead if you
          didn't mean Expense. Positioned `absolute` as a sibling of the list's own ScrollView (not
          inside it) — the same "Slice owns its scroll + its FAB" placement `IouView` also uses, which
          reads `useSafeAreaInsets` directly rather than relying on an ancestor Stack.Navigator/page
          header, since that context is available anywhere under the root SafeAreaProvider. */}
      {!selectMode && (
        <View className="absolute" style={{ bottom: insets.bottom + 16, right: 16 }}>
          <Pressable
            onPress={() => openAdd()}
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
          goals={goals}
          hasPaymentModeMismatches={paymentModeMismatchTxnIds.size > 0}
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
          goals={goals}
          onSeedGoal={onSeedGoal}
          linkedGoal={editingExpense ? goalLinkByTxn.get(editingExpense.id) : undefined}
          linkedBankStatementLines={editingExpense ? bankImportLinkByTxn.get(editingExpense.id) : undefined}
          saveAccount={saveAccount}
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

      {/* Bulk: move to category — full CategoryPickerModal (grouped tiles, Frequent row, Manage),
          same as a single expense's own category edit (ExpenseForm.tsx), not a plain dropdown
          (found 2026-08-13: this used to be a bare `SelectInput`, the only category-change surface in
          the app that wasn't the real picker). `bulkPickerType` majority-votes expense vs. income across
          the selection, same approach `BulkCategorizeModal.tsx` (bank-import) uses for its own picker. */}
      {showBulkCategory && (
        <CategoryPickerModal
          type={bulkPickerType}
          categories={categories}
          manager={categoryManager}
          selectedId=""
          onSelect={(id) => void handleBulkCategory(id)}
          onClose={() => setShowBulkCategory(false)}
        />
      )}

      {/* Bulk: add a tag (additive-only — see BulkHashtagModal's own doc comment) */}
      {showBulkHashtag && (
        <BulkHashtagModal
          hashtags={hashtags}
          count={selected.size}
          onApply={handleBulkHashtag}
          onClose={() => setShowBulkHashtag(false)}
        />
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
