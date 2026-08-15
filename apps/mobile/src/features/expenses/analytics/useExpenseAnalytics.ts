import { useMemo, useState } from 'react';
import type { Account, Budget, Expense, ExpenseCategory } from '@/core/db/types';
import type { ActiveEvent } from '~/context/EventModeContext';
import { normalizeHashtag } from '~/context/EventModeContext';
import { buildParentCategoryMap, groupKey, groupMeta } from '@/core/expenses/categoryGroups';
import { isRoutineGroup } from '@/core/db/defaultCategories';
import { buildAnnualSeries, computeSavingsRate, biggestMovers } from '@/core/expenses/annualAnalytics';
import { monthlyRecap, computeAnomalies } from '@/core/expenses/monthlyInsights';
import { computeCashFlowSummary } from '@/core/expenses/cashFlowSummary';
import { toMonthYearKey } from '@/lib/formatters';
import { offsetMonth, monthBounds, yearBounds, allTimeBounds, DAY_MS } from '@/lib/date';

interface Args {
  expenses: Expense[];
  categoryMap: Map<string, ExpenseCategory>;
  budgets: Budget[];
  /** Cash/wallet accounts get a monthly Cash Flow card (Initial → Income → Expenses → Computed left). */
  accounts: Account[];
  selectedMonth: string;
  analyticsYear: number;
  events: ActiveEvent[];
  pastEvents: ActiveEvent[];
  allEventHashtags: Set<string>;
  /** Transactions that back an IOU ledger entry — treated as non-routine (set aside), not daily-living. */
  iouLinkedTxnIds: Set<string>;
  /** Transactions that back a goal contribution — also non-routine (money set aside toward a goal). */
  goalLinkedTxnIds: Set<string>;
  /** Ids of active Family-type groups — any expense shared into one is set aside regardless of split
   *  or category (it's family spend, not a reciprocal split like Trip/Roommates). */
  familyGroupIds: Set<string>;
  /** Names of tags marked "Set aside" in Manage Tags — any expense carrying one is set aside
   *  regardless of category, reported as its own line (not folded into a category bucket). */
  setAsideTagNames: Set<string>;
}

/** Synthetic set-aside group for money lent (IOU-linked), independent of the txn's own category. */
const IOU_LENDING_GROUP = 'iou_lending';
/** Synthetic set-aside group for a goal contribution (goal-linked), independent of the txn's category. */
const GOAL_CONTRIBUTION_GROUP = 'goal_contribution';
/** Synthetic set-aside group for expenses shared into a Family-type group. */
const FAMILY_SHARE_GROUP = 'family_group_share';
/** Prefix for the synthetic per-tag set-aside group — each Set-Aside tag gets its own reporting line. */
const TAG_GROUP_PREFIX = 'tag:';

type Classify = (e: Expense) => { kind: 'event' | 'routine' | 'setAside'; group: string };
type Scope = (e: Expense) => boolean;

export interface GroupSegment {
  group: string;
  amount: number;
  color: string;
  label: string;
  cats: Array<{
    catId: string;
    name: string;
    icon: string;
    color: string;
    amount: number;
    budgetLimit?: number;
  }>;
  budgetTotal: number;
}

/** Daily-routine breakdown (the Donut + expandable list) for an arbitrary scope (a month or a year) —
 *  shared by the monthly and annual views (2026-08-02) so the yearly breakdown isn't a second
 *  implementation of the same grouping logic. `periodBudgets` is empty for the annual scope: budgets are
 *  a monthly-only concept, so the annual breakdown just shows raw amounts with no budget overlay. */
function buildGroupData(
  expenses: Expense[],
  inScope: Scope,
  classify: Classify,
  categoryMap: Map<string, ExpenseCategory>,
  parentCategoryMap: ReturnType<typeof buildParentCategoryMap>,
  periodBudgets: Budget[]
): GroupSegment[] {
  const byGroup = new Map<string, { amount: number; categories: Map<string, number> }>();
  for (const e of expenses) {
    if (!inScope(e)) continue;
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
          const budget = periodBudgets.find((b) => b.categoryId === catId);
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
      return { group, amount, color: meta.color, label: meta.label, cats, budgetTotal };
    })
    .sort((a, b) => b.amount - a.amount);
}

export interface SetAsideSegment {
  group: string;
  amount: number;
  label: string;
  color: string;
  icon: string;
}

/** "Set aside" breakdown for an arbitrary scope — same grouping `buildGroupData` uses, non-routine only. */
function buildSetAsideData(
  expenses: Expense[],
  inScope: Scope,
  classify: Classify,
  parentCategoryMap: ReturnType<typeof buildParentCategoryMap>
): SetAsideSegment[] {
  const byGroup = new Map<string, number>();
  for (const e of expenses) {
    if (!inScope(e)) continue;
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
      if (group === GOAL_CONTRIBUTION_GROUP) {
        return { group, amount, label: 'Goal contributions', color: '#10b981', icon: 'ti-target' };
      }
      if (group === FAMILY_SHARE_GROUP) {
        return { group, amount, label: 'Shared with family', color: '#ec4899', icon: 'ti-users-group' };
      }
      if (group.startsWith(TAG_GROUP_PREFIX)) {
        return { group, amount, label: `#${group.slice(TAG_GROUP_PREFIX.length)}`, color: '#ec4899', icon: 'ti-hash' };
      }
      const meta = groupMeta(group, parentCategoryMap);
      return { group, amount, label: meta.label, color: meta.color, icon: 'ti-bookmark' };
    })
    .sort((a, b) => b.amount - a.amount);
}

export interface EventSegment {
  id: string;
  name: string;
  color: string;
  amount: number;
  cats: Array<{ catId: string; name: string; icon: string; color: string; amount: number }>;
}

/** Per-event breakdown for an arbitrary scope. */
function buildEventsData(
  expenses: Expense[],
  inScope: Scope,
  events: ActiveEvent[],
  pastEvents: ActiveEvent[],
  categoryMap: Map<string, ExpenseCategory>
): EventSegment[] {
  const allEvents = [...events, ...pastEvents];
  const byEventId = new Map<
    string,
    { id: string; name: string; color: string; amount: number; cats: Map<string, number> }
  >();
  for (const e of expenses) {
    if (!inScope(e)) continue;
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
          return { catId, name: c?.name ?? catId, icon: c?.icon ?? 'ti-dots', color: c?.color ?? '#6b7280', amount };
        })
        .sort((a, b) => b.amount - a.amount)
    }))
    .sort((a, b) => b.amount - a.amount);
}

/** Per-group totals only (no categories) for an arbitrary scope — feeds the "vs prior period" delta
 *  indicator on the daily-routine list (`prevMonthData` monthly, `prevYearGroupData` annually). */
function buildGroupTotals(
  expenses: Expense[],
  inScope: Scope,
  classify: Classify,
  categoryMap: Map<string, ExpenseCategory>
): Map<string, number> {
  const byGroup = new Map<string, number>();
  for (const e of expenses) {
    if (!inScope(e)) continue;
    if (e.type && e.type !== 'expense') continue;
    if (classify(e).kind !== 'routine') continue;
    const cat = categoryMap.get(e.categoryId);
    const group = cat ? groupKey(cat) : 'other';
    byGroup.set(group, (byGroup.get(group) ?? 0) + e.amount);
  }
  return byGroup;
}

/** Top-5 non-event hashtag summary for an arbitrary scope. */
function buildHashtagSummary(
  expenses: Expense[],
  inScope: Scope,
  allEventHashtags: Set<string>
): Array<{ tag: string; amount: number }> {
  const byTag = new Map<string, number>();
  for (const e of expenses) {
    if (!inScope(e)) continue;
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
}

/**
 * RN port of apps/web-react/src/features/expenses/analytics/useExpenseAnalytics.ts — same aggregation
 * logic, unchanged. Groups is now ported — this restores the `familyGroupIds` input (and the "shared into
 * a Family-type group" set-aside branch it feeds), previously dropped here.
 *
 * 2026-08-02: every monthly breakdown (daily-routine groups, set aside, events, hashtags, cash flow, the
 * Pulse Card) now has an annual (`annualXxx`) counterpart, built via the same `buildXxx` scope-generic
 * helpers above rather than a second copy of the aggregation logic — see `AnalyticsTab.tsx` for where
 * both render.
 */
export function useExpenseAnalytics({
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
}: Args) {
  const analyticsMonthBudgets = useMemo(
    () => budgets.filter((b) => b.monthYear === selectedMonth),
    [budgets, selectedMonth]
  );

  const parentCategoryMap = useMemo(() => buildParentCategoryMap([...categoryMap.values()]), [categoryMap]);

  // Classify each expense into a bucket: 'event' (shown separately), 'lending' (IOU-linked), a set-aside
  // intent group, or a daily-routine group. Events are excluded from both breakdowns (they have their own
  // card); lending + set-aside groups feed the "Set aside" summary.
  const classify = useMemo(() => {
    return (e: Expense): { kind: 'event' | 'routine' | 'setAside'; group: string } => {
      if (e.hashtags.some((t) => allEventHashtags.has(normalizeHashtag(t)))) return { kind: 'event', group: '' };
      if (iouLinkedTxnIds.has(e.id)) return { kind: 'setAside', group: IOU_LENDING_GROUP };
      if (goalLinkedTxnIds.has(e.id)) return { kind: 'setAside', group: GOAL_CONTRIBUTION_GROUP };
      if (e.shareWith?.some((id) => familyGroupIds.has(id))) {
        return { kind: 'setAside', group: FAMILY_SHARE_GROUP };
      }
      const setAsideTag = e.hashtags.find((t) => setAsideTagNames.has(normalizeHashtag(t)));
      if (setAsideTag) return { kind: 'setAside', group: `${TAG_GROUP_PREFIX}${normalizeHashtag(setAsideTag)}` };
      const cat = categoryMap.get(e.categoryId);
      const group = cat ? groupKey(cat) : 'other';
      return { kind: isRoutineGroup(group) ? 'routine' : 'setAside', group };
    };
  }, [allEventHashtags, iouLinkedTxnIds, goalLinkedTxnIds, familyGroupIds, setAsideTagNames, categoryMap]);

  const inSelectedMonth: Scope = useMemo(
    () => (e) => toMonthYearKey(new Date(e.date)) === selectedMonth,
    [selectedMonth]
  );
  const inAnalyticsYear: Scope = useMemo(
    () => (e) => new Date(e.date).getFullYear() === analyticsYear,
    [analyticsYear]
  );

  const analyticsData = useMemo(
    () => buildGroupData(expenses, inSelectedMonth, classify, categoryMap, parentCategoryMap, analyticsMonthBudgets),
    [expenses, inSelectedMonth, classify, categoryMap, parentCategoryMap, analyticsMonthBudgets]
  );

  // "Set aside" — non-routine spend (travel, family support, legal, financial moves) + money lent,
  // summarised separately so it never distorts the daily-living picture. One row per bucket.
  const setAsideData = useMemo(
    () => buildSetAsideData(expenses, inSelectedMonth, classify, parentCategoryMap),
    [expenses, inSelectedMonth, classify, parentCategoryMap]
  );

  const setAsideTotal = useMemo(() => setAsideData.reduce((s, seg) => s + seg.amount, 0), [setAsideData]);

  const eventsThisMonth = useMemo(
    () => buildEventsData(expenses, inSelectedMonth, events, pastEvents, categoryMap),
    [expenses, inSelectedMonth, events, pastEvents, categoryMap]
  );

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
    return buildGroupTotals(expenses, (e) => toMonthYearKey(new Date(e.date)) === pm, classify, categoryMap);
  }, [expenses, categoryMap, selectedMonth, classify]);

  const hashtagSummary = useMemo(
    () => buildHashtagSummary(expenses, inSelectedMonth, allEventHashtags),
    [expenses, inSelectedMonth, allEventHashtags]
  );

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

  // Average daily spend (Pulse Card) — divides the all-inclusive total by days elapsed so far (current
  // month) or the full month length (a past month); a future month can't be selected (see the month
  // picker's `maxMonth` guard), so there's no "0 days elapsed" case to special-case beyond div-by-zero.
  const monthlyAvgPerDay = useMemo(() => {
    const [y, mo] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(y ?? 0, mo ?? 1, 0).getDate();
    const isCurrent = selectedMonth === toMonthYearKey(new Date(nowMs));
    const days = isCurrent ? Math.max(1, new Date(nowMs).getDate()) : daysInMonth;
    return monthTotal / days;
  }, [selectedMonth, monthTotal, nowMs]);

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

  // Monthly Cash Flow — one row per account (all types, 2026-08-02: widened from cash/wallet-only per
  // user request), all inside one merged "Cash Flow" tile in AnalyticsTab.tsx; not shown for a month
  // before the account existed.
  const cashFlowSummaries = useMemo(
    () =>
      accounts
        .filter((a) => !a.isArchived)
        .map((account) => ({
          account,
          summary: computeCashFlowSummary(account, expenses, monthBounds(selectedMonth))
        })),
    [accounts, expenses, selectedMonth]
  );

  // ── Annual counterparts (2026-08-02) — same shapes as the monthly ones above, scoped to
  // `analyticsYear` via `inAnalyticsYear` instead of `inSelectedMonth`. ──────────────────────────────────

  const annualCashFlowSummaries = useMemo(
    () =>
      accounts
        .filter((a) => !a.isArchived)
        .map((account) => ({
          account,
          summary: computeCashFlowSummary(account, expenses, yearBounds(analyticsYear))
        })),
    [accounts, expenses, analyticsYear]
  );

  const annualGroupData = useMemo(
    () => buildGroupData(expenses, inAnalyticsYear, classify, categoryMap, parentCategoryMap, []),
    [expenses, inAnalyticsYear, classify, categoryMap, parentCategoryMap]
  );
  const annualGroupTotal = useMemo(() => annualGroupData.reduce((s, seg) => s + seg.amount, 0), [annualGroupData]);

  const annualSetAsideData = useMemo(
    () => buildSetAsideData(expenses, inAnalyticsYear, classify, parentCategoryMap),
    [expenses, inAnalyticsYear, classify, parentCategoryMap]
  );
  const annualSetAsideTotal = useMemo(
    () => annualSetAsideData.reduce((s, seg) => s + seg.amount, 0),
    [annualSetAsideData]
  );

  const annualEvents = useMemo(
    () => buildEventsData(expenses, inAnalyticsYear, events, pastEvents, categoryMap),
    [expenses, inAnalyticsYear, events, pastEvents, categoryMap]
  );

  const annualHashtagSummary = useMemo(
    () => buildHashtagSummary(expenses, inAnalyticsYear, allEventHashtags),
    [expenses, inAnalyticsYear, allEventHashtags]
  );

  const prevYearGroupData = useMemo(
    () =>
      buildGroupTotals(expenses, (e) => new Date(e.date).getFullYear() === analyticsYear - 1, classify, categoryMap),
    [expenses, analyticsYear, classify, categoryMap]
  );

  // Annual equivalent of the monthly recap's `txnCount`/`topCategory` — same routine-only scope as
  // `monthlyRecap()` uses for its own top category (see `monthlyInsights.ts`).
  const annualRecap = useMemo(() => {
    let txnCount = 0;
    const catTotals = new Map<string, number>();
    for (const e of expenses) {
      const kind = e.type ?? 'expense';
      if (kind === 'transfer') continue;
      if (new Date(e.date).getFullYear() !== analyticsYear) continue;
      txnCount++;
      if (kind === 'expense' && classify(e).kind === 'routine') {
        catTotals.set(e.categoryId, (catTotals.get(e.categoryId) ?? 0) + e.amount);
      }
    }
    let topCategory: { name: string; amount: number } | undefined;
    for (const [catId, amount] of catTotals) {
      if (!topCategory || amount > topCategory.amount) {
        const c = categoryMap.get(catId);
        topCategory = { name: c?.name ?? catId, amount };
      }
    }
    return { txnCount, topCategory };
  }, [expenses, analyticsYear, classify, categoryMap]);

  // vs-last-year trend for the annual Pulse Card, mirroring `recap.deltaPct`'s "vs last month".
  const prevYearActualTotal = useMemo(
    () => prevYearData.filter((m) => !m.projected).reduce((s, m) => s + m.expense, 0),
    [prevYearData]
  );
  const annualDeltaPct = prevYearActualTotal > 0 ? (annualTotal - prevYearActualTotal) / prevYearActualTotal : null;

  // Average daily spend for the year — days elapsed so far (current year) or the full calendar year
  // (a past year); a future year can't be selected (year-nav's own guard).
  const annualAvgPerDay = useMemo(() => {
    const now = new Date(nowMs);
    if (analyticsYear === now.getFullYear()) {
      const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86_400_000) + 1;
      return annualTotal / Math.max(1, dayOfYear);
    }
    const isLeap = (analyticsYear % 4 === 0 && analyticsYear % 100 !== 0) || analyticsYear % 400 === 0;
    return annualTotal / (isLeap ? 366 : 365);
  }, [analyticsYear, annualTotal, nowMs]);

  // ── All Time counterparts (2026-08-16, real user report: "we only have Monthly and Annual, we should
  // also have an AllTime") — same scope-generic `buildXxx` helpers, fed `inAllTime` (unconditionally true)
  // instead of a month/year predicate. Per the approved mockup (docs/mockups/proposals/
  // expenses-batch-fixes-v1.html §3), All Time deliberately does NOT get a "vs previous period" delta,
  // anomaly nudges, spend velocity, Biggest Movers, or a MoM/YoY chart — there's no well-defined "previous"
  // for a lifetime scope, and faking one against "all prior years" would show a number nobody asked for. ──

  const inAllTime: Scope = useMemo(() => () => true, []);

  const allTimeGroupData = useMemo(
    () => buildGroupData(expenses, inAllTime, classify, categoryMap, parentCategoryMap, []),
    [expenses, inAllTime, classify, categoryMap, parentCategoryMap]
  );
  const allTimeGroupTotal = useMemo(() => allTimeGroupData.reduce((s, seg) => s + seg.amount, 0), [allTimeGroupData]);

  const allTimeSetAsideData = useMemo(
    () => buildSetAsideData(expenses, inAllTime, classify, parentCategoryMap),
    [expenses, inAllTime, classify, parentCategoryMap]
  );
  const allTimeSetAsideTotal = useMemo(
    () => allTimeSetAsideData.reduce((s, seg) => s + seg.amount, 0),
    [allTimeSetAsideData]
  );

  const allTimeEvents = useMemo(
    () => buildEventsData(expenses, inAllTime, events, pastEvents, categoryMap),
    [expenses, inAllTime, events, pastEvents, categoryMap]
  );

  const allTimeHashtagSummary = useMemo(
    () => buildHashtagSummary(expenses, inAllTime, allEventHashtags),
    [expenses, inAllTime, allEventHashtags]
  );

  const allTimeCashFlowSummaries = useMemo(
    () =>
      accounts
        .filter((a) => !a.isArchived)
        .map((account) => ({
          account,
          summary: computeCashFlowSummary(account, expenses, allTimeBounds(nowMs))
        })),
    [accounts, expenses, nowMs]
  );

  // Lifetime "true total" (all expense-type transactions, no scope filter) — the All Time counterpart of
  // `monthTotal`/`annualTotal`.
  const allTimeTotal = useMemo(() => {
    let total = 0;
    for (const e of expenses) {
      if (e.type && e.type !== 'expense') continue;
      total += e.amount;
    }
    return total;
  }, [expenses]);

  // Lifetime net (income − expense, transfers excluded) — the All Time counterpart of `recap.net`/
  // `annualSavings.saved`.
  const allTimeNet = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const e of expenses) {
      const kind = e.type ?? 'expense';
      if (kind === 'transfer') continue;
      if (kind === 'income') income += e.amount;
      else expense += e.amount;
    }
    return income - expense;
  }, [expenses]);

  // Lifetime equivalent of `recap.txnCount`/`topCategory` — unscoped, same routine-only category basis.
  const allTimeRecap = useMemo(() => {
    let txnCount = 0;
    const catTotals = new Map<string, number>();
    for (const e of expenses) {
      const kind = e.type ?? 'expense';
      if (kind === 'transfer') continue;
      txnCount++;
      if (kind === 'expense' && classify(e).kind === 'routine') {
        catTotals.set(e.categoryId, (catTotals.get(e.categoryId) ?? 0) + e.amount);
      }
    }
    let topCategory: { name: string; amount: number } | undefined;
    for (const [catId, amount] of catTotals) {
      if (!topCategory || amount > topCategory.amount) {
        const c = categoryMap.get(catId);
        topCategory = { name: c?.name ?? catId, amount };
      }
    }
    return { txnCount, topCategory };
  }, [expenses, classify, categoryMap]);

  // Average daily spend over the account's real lifetime — divides `allTimeTotal` by days elapsed since
  // the earliest transaction of any kind (not just expense-type), so a fresh account with one day of data
  // doesn't get diluted by dividing over a longer span than it actually has history for.
  const allTimeAvgPerDay = useMemo(() => {
    if (expenses.length === 0) return 0;
    let earliest = nowMs;
    for (const e of expenses) {
      if (e.date < earliest) earliest = e.date;
    }
    const days = Math.max(1, Math.floor((nowMs - earliest) / DAY_MS) + 1);
    return allTimeTotal / days;
  }, [expenses, nowMs, allTimeTotal]);

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
    monthlyAvgPerDay,
    recap,
    anomalies,
    cashFlowSummaries,
    // Exposed so a caller can drill down into "which transactions make up this group/category/tag" —
    // same classification this hook already uses internally for `analyticsData`/`setAsideData`, not a
    // second copy of that logic.
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
  };
}
