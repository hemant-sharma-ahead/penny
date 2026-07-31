import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { TabStrip, Modal } from '~/components/ui';
import { usePrivacy } from '~/context/PrivacyContext';
import { useSettings } from '~/context/SettingsContext';
import { useEventMode } from '~/context/EventModeContext';
import { useGroupContext } from '~/context/GroupContext';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { shareExpenseToGroup } from '@/core/groups/groupsService';
import type { Expense } from '@/core/db/types';
import { useExpenses } from './useExpenses';
import { ExpensesHeader } from './ExpensesHeader';
import { useTransactionFilters } from './transactions/useTransactionFilters';
import { TransactionsSlice } from './transactions/TransactionsSlice';
import { BudgetsSlice } from './budgets/BudgetsSlice';
import { AnalyticsSlice } from './analytics/AnalyticsSlice';
import { SubscriptionsSlice } from './subscriptions/SubscriptionsSlice';
import { IouSlice } from './iou/IouSlice';
import type { CategoryManager } from './categories/types';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';

type ExpensesTab = 'transactions' | 'subscriptions' | 'iou' | 'analytics';

/**
 * RN port of apps/web-react/src/features/expenses/ExpensesPage.tsx. Groups is now ported — this
 * restores web's `useGroupContext`-derived `shareGroups`/`handleShareToGroup`/`handleShareLater`/
 * `familyGroupIds`, previously dropped here. Web's deep-link-initial-tab (`location.state.tab`) is now
 * restored too via `useRoute().params.initialTab` — `GlanceHeader`'s "Owed to others" tap now lands
 * directly on the IOU tab instead of always defaulting to Transactions (found missing via the
 * 2026-07-25 parity sweep).
 */
export function ExpensesPage() {
  const route = useRoute();
  const initialTab = (route.params as { initialTab?: ExpensesTab } | undefined)?.initialTab;
  const modeBg = useModeBackgroundColor();
  const { shouldMask } = usePrivacy();
  const { safeModeVisibility } = useSettings();
  const { events, pastEvents } = useEventMode();
  const {
    expenses,
    loading: expensesLoading,
    saveExpense,
    deleteExpense,
    accounts,
    categories,
    hashtags,
    expenseCategories,
    categoryMap,
    parentCategoryMap,
    accountMap,
    spendByCategory,
    txnCountByCategory,
    linkedCountByEventHashtag,
    searchMerchant,
    dueRecurring,
    postRecurring,
    skipRecurring,
    templates,
    saveTemplate,
    removeTemplate,
    saveExpenseWithHashtags,
    seedIouFromExpense,
    persons,
    iouLinkByTxn,
    iouLinkedTxnIds,
    accountBalances,
    patchExpenses,
    removeExpenses,
    saveCategory,
    moveTransactions,
    deleteCategory,
    saveParent,
    deleteParent,
    createParentWithChildren
  } = useExpenses();

  const [activeTab, setActiveTab] = useState<ExpensesTab>(initialTab ?? 'transactions');
  // Tabs mount lazily (once, on first visit) and then stay mounted forever after — see the render
  // below for why. `useState(() => ...)` so the initial tab's own entry isn't lost on a later re-render.
  const [visitedTabs, setVisitedTabs] = useState<Set<ExpensesTab>>(() => new Set([initialTab ?? 'transactions']));
  const [showBudgets, setShowBudgets] = useState(false);

  function changeTab(tab: ExpensesTab) {
    setActiveTab(tab);
    setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }
  const txnFilters = useTransactionFilters(expenses, categoryMap);

  // "Share with a group" from the entry form (Track E) — only for a claimed (username) account.
  const { groups, claimed } = useGroupContext();
  const shareGroups =
    hasEntitlement('sync') && claimed
      ? groups.filter((g) => g.status === 'active').map((g) => ({ id: g.id, name: g.name, type: g.type }))
      : [];
  // Any expense shared into a Family-type group, or carrying a Set-Aside tag, is excluded from
  // daily-living analytics regardless of category — see useExpenseAnalytics's classify().
  const familyGroupIds = new Set(groups.filter((g) => g.type === 'family').map((g) => g.id));
  const setAsideTagNames = new Set(hashtags.filter((h) => h.setAside).map((h) => h.name));
  const handleShareToGroup = (expense: Expense, groupId: string, participants?: string[]): Promise<void> =>
    shareExpenseToGroup(groupId, {
      amount: expense.amount,
      description: expense.description,
      categoryId: expense.categoryId,
      ...(participants?.length ? { participants } : {})
    }).then(() => undefined);

  // Share-later (screen 9): the personal transaction already exists — add the group event and mark the
  // transaction as shared (drives the row tint + prevents re-sharing). The personal amount is untouched.
  const handleShareLater = async (expense: Expense, groupId: string): Promise<void> => {
    await handleShareToGroup(expense, groupId);
    await saveExpense({ ...expense, shareWith: [...(expense.shareWith ?? []), groupId], updatedAt: Date.now() });
  };

  const categoryManager: CategoryManager = {
    parentCategoryMap,
    txnCountByCategory,
    saveCategory,
    moveTransactions,
    deleteCategory,
    saveParent,
    deleteParent,
    createParentWithChildren
  };

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <ExpensesHeader
        filteredTotal={txnFilters.filteredTotal}
        monthFilter={txnFilters.monthFilter}
        expenses={expenses}
        expenseCategories={expenseCategories}
        linkedCountByEventHashtag={linkedCountByEventHashtag}
        saveExpense={saveExpense}
      />

      <TabStrip
        scrollable
        options={[
          { value: 'transactions', label: 'Transactions' },
          { value: 'analytics', label: 'Analytics' },
          { value: 'subscriptions', label: 'Subscriptions' },
          { value: 'iou', label: 'IOU' }
        ]}
        value={activeTab}
        onChange={(v) => changeTab(v as ExpensesTab)}
      />

      {/*
       * Each tab mounts lazily — only once the user has actually visited it (`visitedTabs`) — and then
       * stays mounted forever after, toggled only via `display`, instead of the previous
       * `activeTab === 'x' && <Slice />` conditional mount. That pattern unmounted every inactive slice
       * entirely, so switching away from Analytics and back threw away all of `useExpenseAnalytics`'s
       * ~15 `useMemo`'d aggregates (annual series, savings rate, biggest movers, hashtag summary, etc.,
       * each iterating the full expense array) and recomputed them from scratch on every single switch —
       * the real cause of "switching to Analytics takes time" (found by user report, not the parity
       * sweep). Mounting lazily rather than mounting all 4 up front avoids the opposite problem — paying
       * every tab's setup cost at once would have made the *first* paint (Transactions, already slow —
       * see `useExpenses.ts`'s decrypt-on-load cost) feel slower, not snappier. `display: 'none'` removes
       * a hidden-but-mounted tab from layout/paint entirely (RN's real equivalent of CSS `display:
       * none`) while keeping its component instance — and its memoization, scroll position, and local
       * state (filters, expanded groups, search text) — alive. Net effect: the first visit to any tab
       * still costs what it always cost; every visit after that is instant. Same "mount on first focus,
       * keep alive after" behavior React Navigation's own tab navigator defaults to.
       */}
      <View className="flex-1">
        {visitedTabs.has('transactions') && (
          <View style={{ flex: 1, display: activeTab === 'transactions' ? 'flex' : 'none' }}>
            <TransactionsSlice
              loading={expensesLoading}
              filters={txnFilters}
              categoryMap={categoryMap}
              accountMap={accountMap}
              accounts={accounts}
              categories={categories}
              hashtags={hashtags}
              events={events}
              pastEvents={pastEvents}
              shouldMask={shouldMask}
              onSaveExpense={saveExpenseWithHashtags}
              onDeleteExpense={deleteExpense}
              onOpenBudgets={() => setShowBudgets(true)}
              iouPersons={persons}
              onSeedIou={seedIouFromExpense}
              iouLinkByTxn={iouLinkByTxn}
              accountBalances={accountBalances}
              shareGroups={shareGroups}
              onShareToGroup={handleShareToGroup}
              onShareLater={handleShareLater}
              onPatchExpenses={patchExpenses}
              onRemoveExpenses={removeExpenses}
              searchMerchant={searchMerchant}
              dueRecurring={dueRecurring}
              onPostRecurring={postRecurring}
              onSkipRecurring={skipRecurring}
              templates={templates}
              onSaveTemplate={saveTemplate}
              onRemoveTemplate={removeTemplate}
              categoryManager={categoryManager}
            />
          </View>
        )}

        {visitedTabs.has('subscriptions') && (
          <View style={{ flex: 1, display: activeTab === 'subscriptions' ? 'flex' : 'none' }}>
            <SubscriptionsSlice expenses={expenses} masked={shouldMask(!safeModeVisibility.subscriptions)} />
          </View>
        )}

        {visitedTabs.has('iou') && (
          <View style={{ flex: 1, display: activeTab === 'iou' ? 'flex' : 'none' }}>
            <IouSlice />
          </View>
        )}

        {visitedTabs.has('analytics') && (
          <View style={{ flex: 1, display: activeTab === 'analytics' ? 'flex' : 'none' }}>
            <AnalyticsSlice
              expenses={expenses}
              categoryMap={categoryMap}
              masked={shouldMask(false)}
              iouLinkedTxnIds={iouLinkedTxnIds}
              familyGroupIds={familyGroupIds}
              setAsideTagNames={setAsideTagNames}
            />
          </View>
        )}
      </View>

      {showBudgets && (
        <Modal title="Budgets" onClose={() => setShowBudgets(false)} scrollable>
          <BudgetsSlice
            expenseCategories={expenseCategories}
            spendByCategory={spendByCategory}
            shouldMask={shouldMask}
            overlay
          />
        </Modal>
      )}
    </SafeAreaView>
  );
}
