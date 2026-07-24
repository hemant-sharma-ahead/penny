import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

type ExpensesTab = 'transactions' | 'subscriptions' | 'iou' | 'analytics';

/**
 * RN port of apps/web-legacy/src/features/expenses/ExpensesPage.tsx. Groups is now ported — this
 * restores web's `useGroupContext`-derived `shareGroups`/`handleShareToGroup`/`handleShareLater`/
 * `familyGroupIds`, previously dropped here. Web's deep-link-initial-tab (`location.state`) is still
 * dropped — no real nav stack exists yet, same reasoning as every dropped cross-module navigation call
 * elsewhere in this migration.
 */
export function ExpensesPage() {
  const { shouldMask } = usePrivacy();
  const { safeModeVisibility } = useSettings();
  const { events, pastEvents } = useEventMode();
  const {
    expenses,
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

  const [activeTab, setActiveTab] = useState<ExpensesTab>('transactions');
  const [showBudgets, setShowBudgets] = useState(false);
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
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-tertiary">
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
        onChange={(v) => setActiveTab(v as ExpensesTab)}
      />

      <View className="flex-1">
        {activeTab === 'transactions' && (
          <TransactionsSlice
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
        )}

        {activeTab === 'subscriptions' && (
          <SubscriptionsSlice expenses={expenses} masked={shouldMask(!safeModeVisibility.subscriptions)} />
        )}

        {activeTab === 'iou' && <IouSlice />}

        {activeTab === 'analytics' && (
          <AnalyticsSlice
            expenses={expenses}
            categoryMap={categoryMap}
            masked={shouldMask(false)}
            iouLinkedTxnIds={iouLinkedTxnIds}
            familyGroupIds={familyGroupIds}
            setAsideTagNames={setAsideTagNames}
          />
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
