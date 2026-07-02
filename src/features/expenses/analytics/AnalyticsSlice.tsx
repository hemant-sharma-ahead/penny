import { useState } from 'react';
import { useEventMode } from '@/context/EventModeContext';
import type { Expense, ExpenseCategory } from '@/core/db/types';
import { toMonthYearKey } from '@/lib/formatters';
import { AnalyticsTab } from './AnalyticsTab';
import { useExpenseAnalytics } from './useExpenseAnalytics';
import { useBudgets } from '../budgets/useBudgets';

interface AnalyticsSliceProps {
  expenses: Expense[];
  categoryMap: Map<string, ExpenseCategory>;
  mode: 'open' | 'safe' | 'privacy';
  iouLinkedTxnIds: Set<string>;
}

export function AnalyticsSlice({ expenses, categoryMap, mode, iouLinkedTxnIds }: AnalyticsSliceProps) {
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
    iouLinkedTxnIds
  });

  return (
    <div className="flex-1 overflow-y-auto pb-24">
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
        mode={mode}
        promoteHashtagToEvent={promoteHashtagToEvent}
      />
    </div>
  );
}
