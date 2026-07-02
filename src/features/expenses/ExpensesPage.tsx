import { useState } from 'react';
import { TabStrip, Modal } from '@/components/ui';
import { usePrivacy } from '@/context/PrivacyContext';
import { useEventMode } from '@/context/EventModeContext';
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
  const { mode } = usePrivacy();
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
          mode={mode}
          onSaveExpense={saveExpenseWithHashtags}
          onDeleteExpense={deleteExpense}
          onOpenBudgets={() => setShowBudgets(true)}
          iouPersons={persons}
          onSeedIou={seedIouFromExpense}
          iouLinkByTxn={iouLinkByTxn}
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

      {activeTab === 'subscriptions' && <SubscriptionsSlice expenses={expenses} mode={mode} />}

      {activeTab === 'iou' && <IouSlice />}

      {activeTab === 'analytics' && (
        <AnalyticsSlice expenses={expenses} categoryMap={categoryMap} mode={mode} iouLinkedTxnIds={iouLinkedTxnIds} />
      )}

      {showBudgets && (
        <Modal title="Budgets" onClose={() => setShowBudgets(false)} scrollable>
          <BudgetsSlice expenseCategories={expenseCategories} spendByCategory={spendByCategory} mode={mode} overlay />
        </Modal>
      )}
    </div>
  );
}
