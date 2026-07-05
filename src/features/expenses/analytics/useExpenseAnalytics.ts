import { useMemo, useState } from 'react';
import type { Budget, Expense, ExpenseCategory } from '@/core/db/types';
import type { ActiveEvent } from '@/context/EventModeContext';
import { normalizeHashtag } from '@/context/EventModeContext';
import { buildParentCategoryMap, groupKey, groupMeta } from '@/core/expenses/categoryGroups';
import { isRoutineGroup } from '@/core/db/defaultCategories';
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
  /** Transactions that back an IOU ledger entry — treated as non-routine (set aside), not daily-living. */
  iouLinkedTxnIds: Set<string>;
}

/** Synthetic set-aside group for money lent (IOU-linked), independent of the txn's own category. */
const IOU_LENDING_GROUP = 'iou_lending';

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
  allEventHashtags,
  iouLinkedTxnIds
}: Args) {
  const analyticsMonthBudgets = useMemo(
    () => budgets.filter((b) => b.monthYear === selectedMonth),
    [budgets, selectedMonth]
  );

  const parentCategoryMap = useMemo(() => buildParentCategoryMap([...categoryMap.values()]), [categoryMap]);

  // Classify each in-month expense into a bucket: 'event' (shown separately), 'lending' (IOU-linked),
  // a set-aside intent group, or a daily-routine group. Events are excluded from both breakdowns
  // (they have their own card); lending + set-aside groups feed the "Set aside" summary.
  const classify = useMemo(() => {
    return (e: Expense): { kind: 'event' | 'routine' | 'setAside'; group: string } => {
      if (e.hashtags.some((t) => allEventHashtags.has(normalizeHashtag(t)))) return { kind: 'event', group: '' };
      if (iouLinkedTxnIds.has(e.id)) return { kind: 'setAside', group: IOU_LENDING_GROUP };
      const cat = categoryMap.get(e.categoryId);
      const group = cat ? groupKey(cat) : 'other';
      return { kind: isRoutineGroup(group) ? 'routine' : 'setAside', group };
    };
  }, [allEventHashtags, iouLinkedTxnIds, categoryMap]);

  const analyticsData = useMemo(() => {
    const byGroup = new Map<string, { amount: number; categories: Map<string, number> }>();
    for (const e of expenses) {
      if (toMonthYearKey(new Date(e.date)) !== selectedMonth) continue;
      if (e.type && e.type !== 'expense') continue;
      if (classify(e).kind !== 'routine') continue;
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
  }, [expenses, categoryMap, parentCategoryMap, selectedMonth, analyticsMonthBudgets, classify]);

  // "Set aside" — non-routine spend (travel, family support, legal, financial moves) + money lent,
  // summarised separately so it never distorts the daily-living picture. One row per bucket.
  const setAsideData = useMemo(() => {
    const byGroup = new Map<string, number>();
    for (const e of expenses) {
      if (toMonthYearKey(new Date(e.date)) !== selectedMonth) continue;
      if (e.type && e.type !== 'expense') continue;
      const c = classify(e);
      if (c.kind !== 'setAside') continue;
      byGroup.set(c.group, (byGroup.get(c.group) ?? 0) + e.amount);
    }
    return Array.from(byGroup.entries())
      .map(([group, amount]) => {
        if (group === IOU_LENDING_GROUP) {
          return { group, amount, label: 'Lending & IOU', color: '#64748b', icon: 'ti-arrow-up-right' };
        }
        const meta = groupMeta(group, parentCategoryMap);
        return { group, amount, label: meta.label, color: meta.color, icon: 'ti-bookmark' };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [expenses, selectedMonth, classify, parentCategoryMap]);

  const setAsideTotal = useMemo(() => setAsideData.reduce((s, seg) => s + seg.amount, 0), [setAsideData]);

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

  // All-inclusive total for the month: daily-routine + set-aside + event spend (every expense-type
  // transaction), so the header shows the true "everything" figure alongside the routine breakdown.
  const monthTotal = useMemo(() => {
    let total = 0;
    for (const e of expenses) {
      if (toMonthYearKey(new Date(e.date)) !== selectedMonth) continue;
      if (e.type && e.type !== 'expense') continue;
      total += e.amount;
    }
    return total;
  }, [expenses, selectedMonth]);

  const prevMonthData = useMemo(() => {
    const pm = offsetMonth(selectedMonth, -1);
    const byGroup = new Map<string, number>();
    for (const e of expenses) {
      if (toMonthYearKey(new Date(e.date)) !== pm) continue;
      if (e.type && e.type !== 'expense') continue;
      if (classify(e).kind !== 'routine') continue;
      const cat = categoryMap.get(e.categoryId);
      const group = cat ? groupKey(cat) : 'other';
      byGroup.set(group, (byGroup.get(group) ?? 0) + e.amount);
    }
    return byGroup;
  }, [expenses, categoryMap, selectedMonth, classify]);

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
    () => monthlyRecap(expenses, categoryMap, selectedMonth, (e) => classify(e).kind !== 'routine'),
    [expenses, categoryMap, selectedMonth, classify]
  );
  const anomalies = useMemo(
    () => computeAnomalies(expenses, categoryMap, selectedMonth, (e) => classify(e).kind !== 'routine', nowMs),
    [expenses, categoryMap, selectedMonth, classify, nowMs]
  );

  return {
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
  };
}
