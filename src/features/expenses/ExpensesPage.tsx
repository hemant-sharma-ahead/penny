import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { TabStrip, Modal } from '@/components/ui';
import { usePrivacy } from '@/context/PrivacyContext';
import { useSettings } from '@/context/SettingsContext';
import { useEventMode } from '@/context/EventModeContext';
import { useGroupContext } from '@/context/GroupContext';
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

  // Allow deep-links (e.g. the Net Worth → IOU tap) to open a specific tab via navigation state.
  const location = useLocation();
  const initialTab = (location.state as { tab?: ExpensesTab } | null)?.tab ?? 'transactions';
  const [activeTab, setActiveTab] = useState<ExpensesTab>(initialTab);
  const [showBudgets, setShowBudgets] = useState(false);
  const txnFilters = useTransactionFilters(expenses, categoryMap);

  // "Share with a group" from the entry form (Track E) — only for a claimed (username) account.
  const { groups, claimed } = useGroupContext();
  const shareGroups =
    hasEntitlement('sync') && claimed
      ? groups.filter((g) => g.status === 'active').map((g) => ({ id: g.id, name: g.name }))
      : [];
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
    <div className="flex flex-col h-full">
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
        onChange={setActiveTab}
      />

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
        />
      )}

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
    </div>
  );
}
