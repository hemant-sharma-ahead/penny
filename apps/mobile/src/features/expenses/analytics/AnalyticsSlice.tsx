import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useEventMode, normalizeHashtag } from '~/context/EventModeContext';
import { usePrivacy } from '~/context/PrivacyContext';
import { EntityTransactionsModal } from '~/components/shared';
import type { Account, Expense, ExpenseCategory, Hashtag } from '@/core/db/types';
import { toMonthYearKey } from '@/lib/formatters';
import { AnalyticsTab } from './AnalyticsTab';
import { useExpenseAnalytics } from './useExpenseAnalytics';
import { useBudgets } from '../budgets/useBudgets';

interface AnalyticsSliceProps {
  expenses: Expense[];
  categoryMap: Map<string, ExpenseCategory>;
  accountMap: Map<string, Account>;
  accounts: Account[];
  hashtags: Hashtag[];
  masked: boolean;
  iouLinkedTxnIds: Set<string>;
  goalLinkedTxnIds: Set<string>;
  familyGroupIds: Set<string>;
  setAsideTagNames: Set<string>;
}

/**
 * RN port of apps/web-react/src/features/expenses/analytics/AnalyticsSlice.tsx. Groups is now ported —
 * this restores the `familyGroupIds` prop, previously dropped here. Web's outer `overflow-y-auto` scroll
 * wrapper becomes a real `ScrollView` here (previously missing entirely — `ExpensesPage.tsx`'s tab
 * content area has no scroll of its own, unlike the comment here used to claim; `BudgetsSlice.tsx` is
 * the correct reference for this same "slice owns its own scroll" convention).
 */
export function AnalyticsSlice({
  expenses,
  categoryMap,
  accountMap,
  accounts,
  hashtags,
  masked,
  iouLinkedTxnIds,
  goalLinkedTxnIds,
  familyGroupIds,
  setAsideTagNames
}: AnalyticsSliceProps) {
  const { events, pastEvents, allEventHashtags, promoteHashtagToEvent } = useEventMode();
  const { shouldMask } = usePrivacy();
  const { budgets } = useBudgets();

  const [analyticsView, setAnalyticsView] = useState<'monthly' | 'annual' | 'allTime'>('monthly');
  const [analyticsYear, setAnalyticsYear] = useState(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<string>(() => toMonthYearKey());
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [showAnalyticsMonthPicker, setShowAnalyticsMonthPicker] = useState(false);
  // "View transactions" drill-down (2026-08-02) — opened in place, right here in Analytics, rather than
  // navigating to the Transactions tab with a preset filter (see `EntityTransactionsModal`'s own doc
  // comment for why). `viewing` holds the already-filtered list + a title; nothing else needs to know
  // whether that scope was a group, a category, or a tag.
  const [viewing, setViewing] = useState<{ title: string; subtitle: string; list: Expense[] } | null>(null);

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
    monthlyAvgPerDay,
    recap,
    anomalies,
    cashFlowSummaries,
    classify,
    annualData,
    prevYearData,
    annualSavings,
    annualMovers,
    annualTotal,
    annualMax,
    annualCashFlowSummaries,
    annualGroupData,
    annualGroupTotal,
    annualSetAsideData,
    annualSetAsideTotal,
    annualEvents,
    annualHashtagSummary,
    prevYearGroupData,
    annualRecap,
    annualDeltaPct,
    annualAvgPerDay,
    allTimeGroupData,
    allTimeGroupTotal,
    allTimeSetAsideData,
    allTimeSetAsideTotal,
    allTimeEvents,
    allTimeHashtagSummary,
    allTimeCashFlowSummaries,
    allTimeTotal,
    allTimeNet,
    allTimeRecap,
    allTimeAvgPerDay
  } = useExpenseAnalytics({
    expenses,
    categoryMap,
    budgets,
    accounts,
    selectedMonth,
    analyticsYear,
    events,
    pastEvents,
    allEventHashtags,
    iouLinkedTxnIds,
    goalLinkedTxnIds,
    familyGroupIds,
    setAsideTagNames
  });

  // Same in-scope, expense-only filtering `analyticsData`/`setAsideData` (or their annual/all-time
  // counterparts) already use — this just keeps the matching transactions instead of summing them. Scope
  // follows whichever view (monthly/annual/allTime) is currently open, so the same drill-down callbacks
  // work from any of the three. All Time has no date filter at all — every expense-type transaction is
  // in scope, same as `allTimeGroupData`/`allTimeSetAsideData` etc. use `inAllTime` unconditionally.
  const inScopeExpenses = (predicate: (e: Expense) => boolean) =>
    expenses.filter((e) => {
      if (e.type && e.type !== 'expense') return false;
      const inScope =
        analyticsView === 'allTime'
          ? true
          : analyticsView === 'annual'
            ? new Date(e.date).getFullYear() === analyticsYear
            : toMonthYearKey(new Date(e.date)) === selectedMonth;
      return inScope && predicate(e);
    });

  function viewGroup(group: string, label: string) {
    setViewing({
      title: label,
      subtitle:
        analyticsView === 'allTime'
          ? 'All time'
          : analyticsView === 'annual'
            ? `${analyticsYear}`
            : selectedMonth === toMonthYearKey()
              ? 'This month'
              : 'Selected month',
      list: inScopeExpenses((e) => classify(e).group === group)
    });
  }

  function viewCategory(catId: string, label: string) {
    setViewing({
      title: label,
      subtitle:
        analyticsView === 'allTime'
          ? 'This category · all time'
          : analyticsView === 'annual'
            ? `This category · ${analyticsYear}`
            : 'This category · selected month',
      list: inScopeExpenses((e) => e.categoryId === catId)
    });
  }

  function viewTag(tag: string) {
    const norm = normalizeHashtag(tag);
    setViewing({
      title: `#${tag}`,
      subtitle:
        analyticsView === 'allTime'
          ? 'Tagged · all time'
          : analyticsView === 'annual'
            ? `Tagged · ${analyticsYear}`
            : 'Tagged · selected month',
      list: inScopeExpenses((e) => e.hashtags.some((t) => normalizeHashtag(t) === norm))
    });
  }

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
        monthlyAvgPerDay={monthlyAvgPerDay}
        recap={recap}
        anomalies={anomalies}
        cashFlowSummaries={cashFlowSummaries}
        annualData={annualData}
        prevYearData={prevYearData}
        annualSavings={annualSavings}
        annualMovers={annualMovers}
        annualTotal={annualTotal}
        annualMax={annualMax}
        annualCashFlowSummaries={annualCashFlowSummaries}
        annualGroupData={annualGroupData}
        annualGroupTotal={annualGroupTotal}
        annualSetAsideData={annualSetAsideData}
        annualSetAsideTotal={annualSetAsideTotal}
        annualEvents={annualEvents}
        annualHashtagSummary={annualHashtagSummary}
        prevYearGroupData={prevYearGroupData}
        annualRecap={annualRecap}
        annualDeltaPct={annualDeltaPct}
        annualAvgPerDay={annualAvgPerDay}
        allTimeGroupData={allTimeGroupData}
        allTimeGroupTotal={allTimeGroupTotal}
        allTimeSetAsideData={allTimeSetAsideData}
        allTimeSetAsideTotal={allTimeSetAsideTotal}
        allTimeEvents={allTimeEvents}
        allTimeHashtagSummary={allTimeHashtagSummary}
        allTimeCashFlowSummaries={allTimeCashFlowSummaries}
        allTimeTotal={allTimeTotal}
        allTimeNet={allTimeNet}
        allTimeRecap={allTimeRecap}
        allTimeAvgPerDay={allTimeAvgPerDay}
        eventsThisMonth={eventsThisMonth}
        hashtagSummary={hashtagSummary}
        masked={masked}
        promoteHashtagToEvent={promoteHashtagToEvent}
        onViewGroup={viewGroup}
        onViewCategory={viewCategory}
        onViewTag={viewTag}
      />

      {viewing && (
        <EntityTransactionsModal
          key={viewing.title}
          title={viewing.title}
          subtitle={viewing.subtitle}
          expenses={viewing.list}
          categoryMap={categoryMap}
          accountMap={accountMap}
          hashtags={hashtags}
          shouldMask={shouldMask}
          goalLinkedTxnIds={goalLinkedTxnIds}
          onClose={() => setViewing(null)}
        />
      )}
    </ScrollView>
  );
}
