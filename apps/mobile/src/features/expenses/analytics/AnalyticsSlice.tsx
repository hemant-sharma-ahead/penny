import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useEventMode } from '~/context/EventModeContext';
import type { Expense, ExpenseCategory } from '@/core/db/types';
import { toMonthYearKey } from '@/lib/formatters';
import { AnalyticsTab } from './AnalyticsTab';
import { useExpenseAnalytics } from './useExpenseAnalytics';
import { useBudgets } from '../budgets/useBudgets';

interface AnalyticsSliceProps {
  expenses: Expense[];
  categoryMap: Map<string, ExpenseCategory>;
  masked: boolean;
  iouLinkedTxnIds: Set<string>;
  familyGroupIds: Set<string>;
  setAsideTagNames: Set<string>;
}

/**
 * RN port of apps/web-legacy/src/features/expenses/analytics/AnalyticsSlice.tsx. Groups is now ported —
 * this restores the `familyGroupIds` prop, previously dropped here. Web's outer `overflow-y-auto` scroll
 * wrapper becomes a real `ScrollView` here (previously missing entirely — `ExpensesPage.tsx`'s tab
 * content area has no scroll of its own, unlike the comment here used to claim; `BudgetsSlice.tsx` is
 * the correct reference for this same "slice owns its own scroll" convention).
 */
export function AnalyticsSlice({
  expenses,
  categoryMap,
  masked,
  iouLinkedTxnIds,
  familyGroupIds,
  setAsideTagNames
}: AnalyticsSliceProps) {
  const { events, pastEvents, allEventHashtags, promoteHashtagToEvent } = useEventMode();
  const { budgets } = useBudgets();

  const [analyticsView, setAnalyticsView] = useState<'monthly' | 'annual'>('monthly');
  const [analyticsYear, setAnalyticsYear] = useState(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<string>(() => toMonthYearKey());
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [showAnalyticsMonthPicker, setShowAnalyticsMonthPicker] = useState(false);

  const {
    analyticsData,
    analyticsTotal,
    monthTotal,
    setAsideData,
    setAsideTotal,
    eventsThisMonth,
    prevMonthData,
    hashtagSummary,
    spendVelocity,
    recap,
    anomalies,
    annualData,
    prevYearData,
    annualSavings,
    annualMovers,
    annualTotal,
    annualMax
  } = useExpenseAnalytics({
    expenses,
    categoryMap,
    budgets,
    selectedMonth,
    analyticsYear,
    events,
    pastEvents,
    allEventHashtags,
    iouLinkedTxnIds,
    familyGroupIds,
    setAsideTagNames
  });

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 96 }}>
      <AnalyticsTab
        analyticsView={analyticsView}
        onChangeAnalyticsView={setAnalyticsView}
        analyticsYear={analyticsYear}
        onChangeAnalyticsYear={setAnalyticsYear}
        selectedMonth={selectedMonth}
        onChangeSelectedMonth={setSelectedMonth}
        expandedGroup={expandedGroup}
        onChangeExpandedGroup={setExpandedGroup}
        expandedEventId={expandedEventId}
        onChangeExpandedEventId={setExpandedEventId}
        showAnalyticsMonthPicker={showAnalyticsMonthPicker}
        onChangeShowAnalyticsMonthPicker={setShowAnalyticsMonthPicker}
        analyticsData={analyticsData}
        analyticsTotal={analyticsTotal}
        monthTotal={monthTotal}
        setAsideData={setAsideData}
        setAsideTotal={setAsideTotal}
        prevMonthData={prevMonthData}
        spendVelocity={spendVelocity}
        recap={recap}
        anomalies={anomalies}
        annualData={annualData}
        prevYearData={prevYearData}
        annualSavings={annualSavings}
        annualMovers={annualMovers}
        annualTotal={annualTotal}
        annualMax={annualMax}
        eventsThisMonth={eventsThisMonth}
        hashtagSummary={hashtagSummary}
        masked={masked}
        promoteHashtagToEvent={promoteHashtagToEvent}
      />
    </ScrollView>
  );
}
