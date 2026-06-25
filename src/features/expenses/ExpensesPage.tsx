import { useState } from 'react';
import { TabStrip } from '@/components/ui';
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

type ExpensesTab = 'transactions' | 'subscriptions' | 'iou' | 'budgets' | 'analytics';

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
    saveExpenseWithHashtags,
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
          { value: 'subscriptions', label: 'Subscriptions' },
          { value: 'iou', label: 'IOU' },
          { value: 'budgets', label: 'Budgets' },
          { value: 'analytics', label: 'Analytics' }
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
          onPatchExpenses={patchExpenses}
          onRemoveExpenses={removeExpenses}
          categoryManager={categoryManager}
        />
      )}

      {activeTab === 'subscriptions' && <SubscriptionsSlice expenses={expenses} mode={mode} />}

      {activeTab === 'iou' && <IouSlice mode={mode} />}

      {activeTab === 'budgets' && (
        <BudgetsSlice expenseCategories={expenseCategories} spendByCategory={spendByCategory} mode={mode} />
      )}

      {activeTab === 'analytics' && <AnalyticsSlice expenses={expenses} categoryMap={categoryMap} mode={mode} />}
    </div>
  );
}
