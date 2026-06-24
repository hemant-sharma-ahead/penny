import { useMemo } from 'react';
import type { Budget, Expense, ExpenseCategory } from '@/core/db/types';
import type { ActiveEvent } from '@/context/EventModeContext';
import { normalizeHashtag } from '@/context/EventModeContext';
import { INTENT_GROUP_META } from '@/core/db/defaultCategories';
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

  const analyticsData = useMemo(() => {
    const byGroup = new Map<string, { amount: number; categories: Map<string, number> }>();
    for (const e of expenses) {
      if (toMonthYearKey(new Date(e.date)) !== selectedMonth) continue;
      if (e.type && e.type !== 'expense') continue;
      if (e.hashtags.some((t) => allEventHashtags.has(normalizeHashtag(t)))) continue;
      const cat = categoryMap.get(e.categoryId);
      const group = cat?.intentGroup ?? 'other';
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
        return {
          group,
          amount,
          color: INTENT_GROUP_META[group]?.color ?? '#6b7280',
          label: INTENT_GROUP_META[group]?.label ?? group,
          cats,
          budgetTotal
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [expenses, categoryMap, selectedMonth, analyticsMonthBudgets, allEventHashtags]);

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
      const group = cat?.intentGroup ?? 'other';
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

  const annualData = useMemo(() => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: `${analyticsYear}-${String(i + 1).padStart(2, '0')}`,
      label: monthNames[i] ?? '',
      total: 0
    }));
    for (const e of expenses) {
      if (e.type && e.type !== 'expense') continue;
      const d = new Date(e.date);
      if (d.getFullYear() !== analyticsYear) continue;
      const slot = months[d.getMonth()];
      if (slot) slot.total += e.amount;
    }
    return months;
  }, [expenses, analyticsYear]);

  const annualTotal = useMemo(() => annualData.reduce((s, m) => s + m.total, 0), [annualData]);
  const annualMax = useMemo(() => Math.max(...annualData.map((m) => m.total), 1), [annualData]);

  return {
    analyticsData,
    analyticsTotal,
    eventsThisMonth,
    prevMonthData,
    hashtagSummary,
    spendVelocity,
    annualData,
    annualTotal,
    annualMax
  };
}
