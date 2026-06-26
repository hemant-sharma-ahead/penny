import { useMemo, useState } from 'react';
import type { Budget, Expense, ExpenseCategory } from '@/core/db/types';
import type { ActiveEvent } from '@/context/EventModeContext';
import { normalizeHashtag } from '@/context/EventModeContext';
import { buildParentCategoryMap, groupKey, groupMeta } from '@/core/expenses/categoryGroups';
import { buildAnnualSeries, computeSavingsRate, biggestMovers } from '@/core/expenses/annualAnalytics';
import { monthlyRecap, computeAnomalies } from '@/core/expenses/monthlyInsights';
import { toMonthYearKey } from '@/lib/formatters';
import { offsetMonth } from '@/lib/date';

interface Args {
  expenses: Expense[];
  categoryMap: Map<string, ExpenseCategory>;
  budgets: Budget[];
  selectedMonth: string;
  analyticsYear: number;
  events: ActiveEvent[];
  pastEvents: ActiveEvent[];
  allEventHashtags: Set<string>;
}

/**
 * Derives every analytics aggregation for the Analytics tab: per-intent-group spend with
 * per-category budgets, per-event spend, previous-month comparison, hashtag summary,
 * spend velocity projection, and the annual monthly breakdown.
 */
export function useExpenseAnalytics({
  expenses,
  categoryMap,
  budgets,
  selectedMonth,
  analyticsYear,
  events,
  pastEvents,
  allEventHashtags
}: Args) {
  const analyticsMonthBudgets = useMemo(
    () => budgets.filter((b) => b.monthYear === selectedMonth),
    [budgets, selectedMonth]
  );

  const parentCategoryMap = useMemo(() => buildParentCategoryMap([...categoryMap.values()]), [categoryMap]);

  const analyticsData = useMemo(() => {
    const byGroup = new Map<string, { amount: number; categories: Map<string, number> }>();
    for (const e of expenses) {
      if (toMonthYearKey(new Date(e.date)) !== selectedMonth) continue;
      if (e.type && e.type !== 'expense') continue;
      if (e.hashtags.some((t) => allEventHashtags.has(normalizeHashtag(t)))) continue;
      const cat = categoryMap.get(e.categoryId);
      const group = cat ? groupKey(cat) : 'other';
      const slot = byGroup.get(group) ?? { amount: 0, categories: new Map<string, number>() };
      slot.amount += e.amount;
      slot.categories.set(e.categoryId, (slot.categories.get(e.categoryId) ?? 0) + e.amount);
      byGroup.set(group, slot);
    }
    return Array.from(byGroup.entries())
      .map(([group, { amount, categories }]) => {
        const cats = Array.from(categories.entries())
          .map(([catId, catAmount]) => {
            const c = categoryMap.get(catId);
            const budget = analyticsMonthBudgets.find((b) => b.categoryId === catId);
            return {
              catId,
              name: c?.name ?? catId,
              icon: c?.icon ?? 'ti-dots',
              color: c?.color ?? '#6b7280',
              amount: catAmount,
              budgetLimit: budget?.limitAmount
            };
          })
          .sort((a, b) => b.amount - a.amount);
        const budgetTotal = cats.reduce((s, c) => s + (c.budgetLimit ?? 0), 0);
        const meta = groupMeta(group, parentCategoryMap);
        return {
          group,
          amount,
          color: meta.color,
          label: meta.label,
          cats,
          budgetTotal
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [expenses, categoryMap, parentCategoryMap, selectedMonth, analyticsMonthBudgets, allEventHashtags]);

  const eventsThisMonth = useMemo(() => {
    const allEvents = [...events, ...pastEvents];
    const byEventId = new Map<
      string,
      { id: string; name: string; color: string; amount: number; cats: Map<string, number> }
    >();
    for (const e of expenses) {
      if (toMonthYearKey(new Date(e.date)) !== selectedMonth) continue;
      if (e.type && e.type !== 'expense') continue;
      for (const tag of e.hashtags) {
        const normTag = normalizeHashtag(tag);
        const matched = allEvents.find((ev) => normalizeHashtag(ev.hashtag) === normTag);
        if (matched) {
          const slot = byEventId.get(matched.id) ?? {
            id: matched.id,
            name: matched.name,
            color: matched.color,
            amount: 0,
            cats: new Map<string, number>()
          };
          slot.amount += e.amount;
          slot.cats.set(e.categoryId, (slot.cats.get(e.categoryId) ?? 0) + e.amount);
          byEventId.set(matched.id, slot);
          break;
        }
      }
    }
    return Array.from(byEventId.values())
      .map((ev) => ({
        ...ev,
        cats: Array.from(ev.cats.entries())
          .map(([catId, amount]) => {
            const c = categoryMap.get(catId);
            return {
              catId,
              name: c?.name ?? catId,
              icon: c?.icon ?? 'ti-dots',
              color: c?.color ?? '#6b7280',
              amount
            };
          })
          .sort((a, b) => b.amount - a.amount)
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses, events, pastEvents, selectedMonth, categoryMap]);

  const analyticsTotal = useMemo(() => analyticsData.reduce((s, seg) => s + seg.amount, 0), [analyticsData]);

  const prevMonthData = useMemo(() => {
    const pm = offsetMonth(selectedMonth, -1);
    const byGroup = new Map<string, number>();
    for (const e of expenses) {
      if (toMonthYearKey(new Date(e.date)) !== pm) continue;
      if (e.type && e.type !== 'expense') continue;
      if (e.hashtags.some((t) => allEventHashtags.has(normalizeHashtag(t)))) continue;
      const cat = categoryMap.get(e.categoryId);
      const group = cat ? groupKey(cat) : 'other';
      byGroup.set(group, (byGroup.get(group) ?? 0) + e.amount);
    }
    return byGroup;
  }, [expenses, categoryMap, selectedMonth, allEventHashtags]);

  const hashtagSummary = useMemo(() => {
    const byTag = new Map<string, number>();
    for (const e of expenses) {
      if (toMonthYearKey(new Date(e.date)) !== selectedMonth) continue;
      if (e.type && e.type !== 'expense') continue;
      for (const tag of e.hashtags) {
        if (tag === 'sample') continue;
        if (allEventHashtags.has(normalizeHashtag(tag))) continue;
        byTag.set(tag, (byTag.get(tag) ?? 0) + e.amount);
      }
    }
    return Array.from(byTag.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([tag, amount]) => ({ tag, amount }));
  }, [expenses, selectedMonth, allEventHashtags]);

  const spendVelocity = useMemo(() => {
    if (selectedMonth !== toMonthYearKey() || analyticsTotal === 0) return null;
    const now = new Date();
    const daysElapsed = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (daysElapsed === 0) return null;
    const projected = Math.round((analyticsTotal / daysElapsed) * daysInMonth);
    return { daysElapsed, daysInMonth, projected };
  }, [selectedMonth, analyticsTotal]);

  const [nowMs] = useState(() => Date.now());

  const annualData = useMemo(() => buildAnnualSeries(expenses, analyticsYear, nowMs), [expenses, analyticsYear, nowMs]);
  const prevYearData = useMemo(
    () => buildAnnualSeries(expenses, analyticsYear - 1, nowMs),
    [expenses, analyticsYear, nowMs]
  );
  const annualSavings = useMemo(() => computeSavingsRate(annualData), [annualData]);
  const annualMovers = useMemo(() => biggestMovers(expenses, categoryMap, nowMs, 3), [expenses, categoryMap, nowMs]);

  // Actual-expense total this year (header), and a chart max spanning expense,
  // income and last year's expense so all series share one scale.
  const annualTotal = useMemo(
    () => annualData.filter((m) => !m.projected).reduce((s, m) => s + m.expense, 0),
    [annualData]
  );
  const annualMax = useMemo(
    () => Math.max(1, ...annualData.map((m) => Math.max(m.expense, m.income)), ...prevYearData.map((m) => m.expense)),
    [annualData, prevYearData]
  );

  // Monthly recap + anomaly nudges — same event-excluded basis as the rest of the
  // monthly view (event-tagged expenses don't count toward category run-rates).
  const recap = useMemo(
    () =>
      monthlyRecap(expenses, categoryMap, selectedMonth, (e) =>
        e.hashtags.some((t) => allEventHashtags.has(normalizeHashtag(t)))
      ),
    [expenses, categoryMap, selectedMonth, allEventHashtags]
  );
  const anomalies = useMemo(
    () =>
      computeAnomalies(
        expenses,
        categoryMap,
        selectedMonth,
        (e) => e.hashtags.some((t) => allEventHashtags.has(normalizeHashtag(t))),
        nowMs
      ),
    [expenses, categoryMap, selectedMonth, allEventHashtags, nowMs]
  );

  return {
    analyticsData,
    analyticsTotal,
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
  };
}
