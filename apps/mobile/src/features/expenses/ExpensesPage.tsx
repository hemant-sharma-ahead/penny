import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { TabStrip, Modal, PennyLoader } from '~/components/ui';
import { usePrivacy } from '~/context/PrivacyContext';
import { useSettings } from '~/context/SettingsContext';
import { useEventMode } from '~/context/EventModeContext';
import { useGroupContext } from '~/context/GroupContext';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { shareExpenseToGroup } from '@/core/groups/groupsService';
import type { Expense } from '@/core/db/types';
import { useRegisterHeaderScreen } from '~/navigation/HeaderBackContext';
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
  useRegisterHeaderScreen('ExpensesMain');
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
    reloadExpenses,
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
    goals,
    seedGoalFromExpense,
    goalLinkByTxn,
    goalLinkedTxnIds,
    bankImportLinkByTxn,
    paymentModeMismatchTxnIds,
    txnIdsByGoal,
    saveAccount,
    accountBalances,
    accountsNeedingAttention,
    patchExpenses,
    removeExpenses,
    bulkAddHashtag,
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

  // Analytics' first-ever mount does real, unavoidable work — `useExpenseAnalytics.ts`'s ~15 memoized
  // aggregates, each a full pass over the (up to 4,000+ row) expense array, computed synchronously as
  // part of `AnalyticsSlice`'s own render (a `useMemo` can't yield mid-computation to let a spinner
  // paint first). `analyticsReady` gates that first mount behind one extra render: the moment Analytics
  // is newly visited, this paints `PennyLoader` alone (cheap — `AnalyticsSlice` isn't mounted yet, so
  // none of the heavy aggregation has run), then the effect below flips `analyticsReady` on the next
  // macrotask (`setTimeout(0)`, not `InteractionManager` — RN's own re-export of that warns on read, see
  // `reactNativeShim.ts`), giving the loader's frame a chance to actually reach the screen before the
  // heavy synchronous work blocks the JS thread. Once true, it stays true — every switch back to
  // Analytics after this first mount is genuinely free (see the `familyGroupIds`/`setAsideTagNames` fix
  // above, which removes the bug that used to make every switch pay this same cost, not just the first).
  const [analyticsReady, setAnalyticsReady] = useState(false);
  useEffect(() => {
    if (!visitedTabs.has('analytics') || analyticsReady) return;
    const t = setTimeout(() => setAnalyticsReady(true), 0);
    return () => clearTimeout(t);
  }, [visitedTabs, analyticsReady]);

  function changeTab(tab: ExpensesTab) {
    setActiveTab(tab);
    setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }
  const txnFilters = useTransactionFilters(expenses, categoryMap, txnIdsByGoal, paymentModeMismatchTxnIds);

  // "Share with a group" from the entry form (Track E) — only for a claimed (username) account.
  const { groups, claimed } = useGroupContext();
  const shareGroups =
    hasEntitlement('sync') && claimed
      ? groups.filter((g) => g.status === 'active').map((g) => ({ id: g.id, name: g.name, type: g.type }))
      : [];
  // Any expense shared into a Family-type group, or carrying a Set-Aside tag, is excluded from
  // daily-living analytics regardless of category — see useExpenseAnalytics's classify().
  //
  // Memoized — found 2026-08-14 via a "switching Transactions↔Analytics feels slow every time, not just
  // the first time" report: these two used to be plain `new Set(...)` literals recomputed on every
  // render of `ExpensesPage` (i.e. on every tab switch, or any other state change here — `showBudgets`
  // toggling, etc.), even though `AnalyticsSlice` stays mounted (see the "lazy-mount-once" comment
  // below). A fresh `Set` identity each render fed straight into `useExpenseAnalytics`'s `classify`
  // memo (`familyGroupIds`/`setAsideTagNames` are both in its dep array), which in turn is a dependency
  // of nearly every one of that hook's ~15 memoized aggregates — so every single tab switch was silently
  // paying the SAME full recompute the docblock below claims only the first visit pays. `groups`
  // (`useGroupContext()`) and `hashtags` (`useExpenses()`) are themselves already stable
  // repository-backed arrays (unchanged reference unless the underlying data actually changes), so
  // keying off them here is enough to make `familyGroupIds`/`setAsideTagNames` — and therefore
  // `classify` and everything downstream of it — stable across unrelated re-renders too.
  const familyGroupIds = useMemo(() => new Set(groups.filter((g) => g.type === 'family').map((g) => g.id)), [groups]);
  const setAsideTagNames = useMemo(() => new Set(hashtags.filter((h) => h.setAside).map((h) => h.name)), [hashtags]);
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
        transactionCount={txnFilters.filteredExpenses.length}
        expenses={expenses}
        expenseCategories={expenseCategories}
        linkedCountByEventHashtag={linkedCountByEventHashtag}
        saveExpense={saveExpense}
        accountsNeedingAttention={accountsNeedingAttention}
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
              onRefresh={reloadExpenses}
              onOpenBudgets={() => setShowBudgets(true)}
              iouPersons={persons}
              onSeedIou={seedIouFromExpense}
              iouLinkByTxn={iouLinkByTxn}
              goals={goals}
              onSeedGoal={seedGoalFromExpense}
              goalLinkByTxn={goalLinkByTxn}
              goalLinkedTxnIds={goalLinkedTxnIds}
              bankImportLinkByTxn={bankImportLinkByTxn}
              paymentModeMismatchTxnIds={paymentModeMismatchTxnIds}
              saveAccount={saveAccount}
              accountBalances={accountBalances}
              shareGroups={shareGroups}
              onShareToGroup={handleShareToGroup}
              onShareLater={handleShareLater}
              onPatchExpenses={patchExpenses}
              onRemoveExpenses={removeExpenses}
              onBulkAddHashtag={bulkAddHashtag}
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
            {analyticsReady ? (
              <AnalyticsSlice
                expenses={expenses}
                categoryMap={categoryMap}
                accountMap={accountMap}
                accounts={accounts}
                hashtags={hashtags}
                masked={shouldMask(false)}
                iouLinkedTxnIds={iouLinkedTxnIds}
                goalLinkedTxnIds={goalLinkedTxnIds}
                familyGroupIds={familyGroupIds}
                setAsideTagNames={setAsideTagNames}
              />
            ) : (
              <View className="flex-1 items-center justify-center">
                <PennyLoader size="lg" accessibilityLabel="Loading analytics" />
              </View>
            )}
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
