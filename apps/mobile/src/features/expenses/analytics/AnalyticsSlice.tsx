import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEventMode, normalizeHashtag } from '~/context/EventModeContext';
import { usePrivacy } from '~/context/PrivacyContext';
import { EntityTransactionsModal } from '~/components/shared';
import type { Account, Expense, ExpenseCategory, Hashtag } from '@/core/db/types';
import { toMonthYearKey } from '@/lib/formatters';
import { AnalyticsTab } from './AnalyticsTab';
import { useExpenseAnalytics, incomeGroupKey } from './useExpenseAnalytics';
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
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();

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
    incomeData,
    incomeTotal,
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
    annualIncomeData,
    annualIncomeTotal,
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
    allTimeIncomeData,
    allTimeIncomeTotal,
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

  // Same in-scope filtering `analyticsData`/`setAsideData`/`incomeData` (or their annual/all-time
  // counterparts) already use — this just keeps the matching transactions instead of summing them. Scope
  // follows whichever view (monthly/annual/allTime) is currently open, so the same drill-down callbacks
  // work from any of the three. All Time has no date filter at all — every in-scope transaction is in
  // scope, same as `allTimeGroupData`/`allTimeSetAsideData`/`allTimeIncomeData` etc. use `inAllTime`
  // unconditionally.
  //
  // Item 46: excludes transfers only, not "anything but expense" — `viewGroup`/`viewCategory` (expense
  // side) and `viewIncomeGroup`/`viewIncomeCategory` (income side) below each add their own explicit
  // `e.type === 'expense'`/`'income'` check on top of this rather than relying on group/category ids
  // never colliding across types — real-device testing found that assumption false (see
  // `incomeGroupKey`'s doc comment in `useExpenseAnalytics.ts`), so this base filter now only handles
  // the one thing every caller agrees on (never show transfers here).
  const inScopeExpenses = (predicate: (e: Expense) => boolean) =>
    expenses.filter((e) => {
      const kind = e.type ?? 'expense';
      if (kind === 'transfer') return false;
      const inScope =
        analyticsView === 'allTime'
          ? true
          : analyticsView === 'annual'
            ? new Date(e.date).getFullYear() === analyticsYear
            : toMonthYearKey(new Date(e.date)) === selectedMonth;
      return inScope && predicate(e);
    });

  // Item 22/23 (docs/plans/real-device-testing-pass.md) — every `EntityTransactionsModal` caller shows
  // a transaction count in `subtitle`. These three already had a scope-describing subtitle, so the
  // count is appended to it rather than overwriting what was already there.
  function withCount(subtitle: string, count: number): string {
    return `${subtitle} · ${count} transaction${count !== 1 ? 's' : ''}`;
  }

  // Daily Routine / Set Aside drill-down — explicitly `e.type === 'expense'` (2026-08-20 fix): both
  // used to filter only by group/category membership with no type check at all, on the unstated
  // assumption that an income category id/group key never matches an expense one. Real-device testing
  // found that assumption false (a pre-existing data mismatch — see `incomeGroupKey`'s doc comment in
  // `useExpenseAnalytics.ts`), which let "View all transactions in Financial" opened from *either*
  // side pull in the *other* side's transactions too. `buildGroupData`/`buildSetAsideData` already
  // only ever see expense-type transactions; these two now match that same invariant explicitly
  // instead of relying on category ids happening not to collide.
  function viewGroup(group: string, label: string) {
    const list = inScopeExpenses((e) => e.type === 'expense' && classify(e).group === group);
    setViewing({
      title: label,
      subtitle: withCount(
        analyticsView === 'allTime'
          ? 'All time'
          : analyticsView === 'annual'
            ? `${analyticsYear}`
            : selectedMonth === toMonthYearKey()
              ? 'This month'
              : 'Selected month',
        list.length
      ),
      list
    });
  }

  function viewCategory(catId: string, label: string) {
    const list = inScopeExpenses((e) => e.type === 'expense' && e.categoryId === catId);
    setViewing({
      title: label,
      subtitle: withCount(
        analyticsView === 'allTime'
          ? 'This category · all time'
          : analyticsView === 'annual'
            ? `This category · ${analyticsYear}`
            : 'This category · selected month',
        list.length
      ),
      list
    });
  }

  // Income's own drill-down pair — mirrors `viewGroup`/`viewCategory` above but scoped to
  // `e.type === 'income'`, and matches by `incomeGroupKey()` (not the raw `classify()`/`groupKey()`
  // an expense-side category would resolve to) so the transactions shown always agree with exactly
  // what `IncomeSection`'s own row totals summed (see `incomeGroupKey`'s doc comment).
  function viewIncomeGroup(group: string, label: string) {
    const list = inScopeExpenses((e) => e.type === 'income' && incomeGroupKey(categoryMap.get(e.categoryId)) === group);
    setViewing({
      title: label,
      subtitle: withCount(
        analyticsView === 'allTime'
          ? 'All time'
          : analyticsView === 'annual'
            ? `${analyticsYear}`
            : selectedMonth === toMonthYearKey()
              ? 'This month'
              : 'Selected month',
        list.length
      ),
      list
    });
  }

  function viewIncomeCategory(catId: string, label: string) {
    const list = inScopeExpenses((e) => e.type === 'income' && e.categoryId === catId);
    setViewing({
      title: label,
      subtitle: withCount(
        analyticsView === 'allTime'
          ? 'This category · all time'
          : analyticsView === 'annual'
            ? `This category · ${analyticsYear}`
            : 'This category · selected month',
        list.length
      ),
      list
    });
  }

  function viewTag(tag: string) {
    const norm = normalizeHashtag(tag);
    const list = inScopeExpenses((e) => e.hashtags.some((t) => normalizeHashtag(t) === norm));
    setViewing({
      title: `#${tag}`,
      subtitle: withCount(
        analyticsView === 'allTime'
          ? 'Tagged · all time'
          : analyticsView === 'annual'
            ? `Tagged · ${analyticsYear}`
            : 'Tagged · selected month',
        list.length
      ),
      list
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
        incomeData={incomeData}
        incomeTotal={incomeTotal}
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
        annualIncomeData={annualIncomeData}
        annualIncomeTotal={annualIncomeTotal}
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
        allTimeIncomeData={allTimeIncomeData}
        allTimeIncomeTotal={allTimeIncomeTotal}
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
        onViewIncomeGroup={viewIncomeGroup}
        onViewIncomeCategory={viewIncomeCategory}
        onViewTag={viewTag}
        onSeeAllTips={() => navigation.navigate('Home', { screen: 'DiscoverTips' })}
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
