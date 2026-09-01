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
  /** Which of the 3 views (Monthly/Annual/All-Time) is actually on screen right now (2026-08-29
   *  performance fix — see `docs/ARCHITECTURE.md`'s matching decision entry). Only the active view's
   *  data is actually computed; the other two return cheap empty defaults instead of running their
   *  full `expenses`-array scans — there was previously no way for this hook to know which view was
   *  visible, so it computed all three unconditionally on every `expenses` change, including while
   *  Analytics was backgrounded. */
  analyticsView: 'monthly' | 'annual' | 'allTime';
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
  /** Category drill-down within this group (item 24) — same shape `GroupSegment.cats` uses minus
   *  `budgetLimit` (Set Aside groups aren't budget-tracked), so `SetAsideSection` can mirror
   *  `DailyRoutineSection`'s exact expand/collapse pattern. */
  cats: Array<{ catId: string; name: string; icon: string; color: string; amount: number }>;
}

/** "Set aside" breakdown for an arbitrary scope — same grouping `buildGroupData` uses, non-routine only. */
function buildSetAsideData(
  expenses: Expense[],
  inScope: Scope,
  classify: Classify,
  categoryMap: Map<string, ExpenseCategory>,
  parentCategoryMap: ReturnType<typeof buildParentCategoryMap>
): SetAsideSegment[] {
  const byGroup = new Map<string, { amount: number; categories: Map<string, number> }>();
  for (const e of expenses) {
    if (!inScope(e)) continue;
    if (e.type && e.type !== 'expense') continue;
    const c = classify(e);
    if (c.kind !== 'setAside') continue;
    const slot = byGroup.get(c.group) ?? { amount: 0, categories: new Map<string, number>() };
    slot.amount += e.amount;
    slot.categories.set(e.categoryId, (slot.categories.get(e.categoryId) ?? 0) + e.amount);
    byGroup.set(c.group, slot);
  }
  return Array.from(byGroup.entries())
    .map(([group, { amount, categories }]) => {
      const cats = Array.from(categories.entries())
        .map(([catId, catAmount]) => {
          const cat = categoryMap.get(catId);
          return {
            catId,
            name: cat?.name ?? catId,
            icon: cat?.icon ?? 'ti-dots',
            color: cat?.color ?? '#6b7280',
            amount: catAmount
          };
        })
        .sort((a, b) => b.amount - a.amount);
      if (group === IOU_LENDING_GROUP) {
        return { group, amount, label: 'Lending & IOU', color: '#64748b', icon: 'ti-arrow-up-right', cats };
      }
      if (group === GOAL_CONTRIBUTION_GROUP) {
        return { group, amount, label: 'Goal contributions', color: '#10b981', icon: 'ti-target', cats };
      }
      if (group === FAMILY_SHARE_GROUP) {
        return { group, amount, label: 'Shared with family', color: '#ec4899', icon: 'ti-users-group', cats };
      }
      if (group.startsWith(TAG_GROUP_PREFIX)) {
        return {
          group,
          amount,
          label: `#${group.slice(TAG_GROUP_PREFIX.length)}`,
          color: '#ec4899',
          icon: 'ti-hash',
          cats
        };
      }
      const meta = groupMeta(group, parentCategoryMap);
      return { group, amount, label: meta.label, color: meta.color, icon: 'ti-bookmark', cats };
    })
    .sort((a, b) => b.amount - a.amount);
}

export interface IncomeSegment {
  group: string;
  amount: number;
  label: string;
  color: string;
  icon: string;
  /** Category drill-down within this group — same shape `SetAsideSegment.cats` uses (income has no
   *  budget concept either, so this mirrors `SetAsideSegment`'s shape, not `GroupSegment`'s). */
  cats: Array<{ catId: string; name: string; icon: string; color: string; amount: number }>;
}

/** The group key an income-type transaction's category should render under. A category only ever
 *  determines its own row when it's itself `applicableTo: 'income'` (matches every one of the 15
 *  `DEFAULT_INCOME_CATEGORIES`, all `intentGroup: 'income'` with no `parentId`, so this collapses to
 *  the single 'income' bucket in the common case — a user-created custom income category filed under
 *  its own custom parent group still splits into its own row for free, exactly like a custom expense
 *  parent group already does in `buildGroupData`/`buildSetAsideData`).
 *
 *  2026-08-20 (real-device testing, item 46 follow-up): a category whose `applicableTo` is NOT
 *  'income' (e.g. `cat-loan-emi`/`cat-savings`, both `applicableTo: 'expense'`) can still end up on an
 *  income-type transaction as pre-existing data (from before the category picker enforced this, or
 *  from an import path that didn't) — `groupKey()` would return that category's *expense-side* fixed
 *  intentGroup (e.g. 'financial'), the exact same string `buildSetAsideData` uses for its own
 *  expense-side "Financial" row. Left alone this both mislabels the row (Income showing a "Financial"
 *  sub-group makes no sense) and collides `expandedGroup` with the unrelated Set Aside row sharing that
 *  string, so expanding one expands the other. Falling back to the fixed 'income' bucket for any
 *  non-income-applicable category closes both bugs at the root — the mismatched transaction is still
 *  fully visible (it lands in `cats[]` under whichever bucket it fell into), just never lets a
 *  category that was never actually income-side own its own top-level row or key. */
export function incomeGroupKey(cat: ExpenseCategory | undefined): string {
  if (!cat) return 'income';
  return cat.applicableTo === 'income' ? groupKey(cat) : 'income';
}

/** "Income" breakdown for an arbitrary scope — item 46 (docs/plans/real-device-testing-pass.md Phase
 *  6b): income had zero category-wise visibility anywhere in Analytics (`buildGroupData`/
 *  `buildSetAsideData` both explicitly skip `e.type !== 'expense'` before `classify()` ever runs, so
 *  income wasn't misclassified into Set Aside, it was just silently dropped). Groups by
 *  `incomeGroupKey()` (see its own doc comment above for why that's not the raw `groupKey()`
 *  `buildGroupData`/`buildSetAsideData` use). */
function buildIncomeData(
  expenses: Expense[],
  inScope: Scope,
  categoryMap: Map<string, ExpenseCategory>,
  parentCategoryMap: ReturnType<typeof buildParentCategoryMap>
): IncomeSegment[] {
  const byGroup = new Map<string, { amount: number; categories: Map<string, number> }>();
  for (const e of expenses) {
    if (!inScope(e)) continue;
    if (e.type !== 'income') continue;
    const cat = categoryMap.get(e.categoryId);
    const group = incomeGroupKey(cat);
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
          return {
            catId,
            name: c?.name ?? catId,
            icon: c?.icon ?? 'ti-dots',
            color: c?.color ?? '#6b7280',
            amount: catAmount
          };
        })
        .sort((a, b) => b.amount - a.amount);
      const meta = groupMeta(group, parentCategoryMap);
      return { group, amount, label: meta.label, color: meta.color, icon: 'ti-cash', cats };
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

/** Top-5 non-event hashtag summary for an arbitrary scope. Groups by the lowercased tag (2026-08-18
 *  fix) so any mixed-case history still lingering from before the case-normalization fix/migration
 *  (or a not-yet-repaired database) collapses into one row instead of splitting "Trip"/"trip" into two. */
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
      const key = tag.toLowerCase();
      if (key === 'sample') continue;
      if (allEventHashtags.has(normalizeHashtag(tag))) continue;
      byTag.set(key, (byTag.get(key) ?? 0) + e.amount);
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
  setAsideTagNames,
  analyticsView
}: Args) {
  const isMonthly = analyticsView === 'monthly';
  const isAnnual = analyticsView === 'annual';
  const isAllTime = analyticsView === 'allTime';

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
    () =>
      isMonthly
        ? buildGroupData(expenses, inSelectedMonth, classify, categoryMap, parentCategoryMap, analyticsMonthBudgets)
        : [],
    [isMonthly, expenses, inSelectedMonth, classify, categoryMap, parentCategoryMap, analyticsMonthBudgets]
  );

  // "Set aside" — non-routine spend (travel, family support, legal, financial moves) + money lent,
  // summarised separately so it never distorts the daily-living picture. One row per bucket.
  const setAsideData = useMemo(
    () => (isMonthly ? buildSetAsideData(expenses, inSelectedMonth, classify, categoryMap, parentCategoryMap) : []),
    [isMonthly, expenses, inSelectedMonth, classify, categoryMap, parentCategoryMap]
  );

  const setAsideTotal = useMemo(() => setAsideData.reduce((s, seg) => s + seg.amount, 0), [setAsideData]);

  // Item 46 — income breakdown for the month, same "arbitrary scope, scope-generic builder" pattern
  // as `setAsideData` above.
  const incomeData = useMemo(
    () => (isMonthly ? buildIncomeData(expenses, inSelectedMonth, categoryMap, parentCategoryMap) : []),
    [isMonthly, expenses, inSelectedMonth, categoryMap, parentCategoryMap]
  );
  const incomeTotal = useMemo(() => incomeData.reduce((s, seg) => s + seg.amount, 0), [incomeData]);

  const eventsThisMonth = useMemo(
    () => (isMonthly ? buildEventsData(expenses, inSelectedMonth, events, pastEvents, categoryMap) : []),
    [isMonthly, expenses, inSelectedMonth, events, pastEvents, categoryMap]
  );

  const analyticsTotal = useMemo(() => analyticsData.reduce((s, seg) => s + seg.amount, 0), [analyticsData]);

  // All-inclusive total for the month: daily-routine + set-aside + event spend (every expense-type
  // transaction), so the header shows the true "everything" figure alongside the routine breakdown.
  // Gated like every other Monthly-only field below — see `analyticsView`'s own doc comment (2026-08-29
  // performance fix): only scans `expenses` when the Monthly view is actually the one on screen.
  const monthTotal = useMemo(() => {
    if (!isMonthly) return 0;
    let total = 0;
    for (const e of expenses) {
      if (toMonthYearKey(new Date(e.date)) !== selectedMonth) continue;
      if (e.type && e.type !== 'expense') continue;
      total += e.amount;
    }
    return total;
  }, [isMonthly, expenses, selectedMonth]);

  const prevMonthData = useMemo(() => {
    if (!isMonthly) return new Map<string, number>();
    const pm = offsetMonth(selectedMonth, -1);
    return buildGroupTotals(expenses, (e) => toMonthYearKey(new Date(e.date)) === pm, classify, categoryMap);
  }, [isMonthly, expenses, categoryMap, selectedMonth, classify]);

  const hashtagSummary = useMemo(
    () => (isMonthly ? buildHashtagSummary(expenses, inSelectedMonth, allEventHashtags) : []),
    [isMonthly, expenses, inSelectedMonth, allEventHashtags]
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

  const annualData = useMemo(
    () => (isAnnual ? buildAnnualSeries(expenses, analyticsYear, nowMs) : []),
    [isAnnual, expenses, analyticsYear, nowMs]
  );
  const prevYearData = useMemo(
    () => (isAnnual ? buildAnnualSeries(expenses, analyticsYear - 1, nowMs) : []),
    [isAnnual, expenses, analyticsYear, nowMs]
  );
  const annualSavings = useMemo(() => computeSavingsRate(annualData), [annualData]);
  const annualMovers = useMemo(
    () => (isAnnual ? biggestMovers(expenses, categoryMap, nowMs, 3) : []),
    [isAnnual, expenses, categoryMap, nowMs]
  );

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
      isMonthly
        ? monthlyRecap(expenses, categoryMap, selectedMonth, (e) => classify(e).kind !== 'routine')
        : { month: selectedMonth, expense: 0, income: 0, net: 0, txnCount: 0, prevExpense: 0, deltaPct: null },
    [isMonthly, expenses, categoryMap, selectedMonth, classify]
  );
  const anomalies = useMemo(
    () =>
      isMonthly
        ? computeAnomalies(expenses, categoryMap, selectedMonth, (e) => classify(e).kind !== 'routine', nowMs)
        : [],
    [isMonthly, expenses, categoryMap, selectedMonth, classify, nowMs]
  );

  // Monthly Cash Flow — one row per account (all types, 2026-08-02: widened from cash/wallet-only per
  // user request), all inside one merged "Cash Flow" tile in AnalyticsTab.tsx; not shown for a month
  // before the account existed.
  const cashFlowSummaries = useMemo(
    () =>
      isMonthly
        ? accounts
            .filter((a) => !a.isArchived)
            .map((account) => ({
              account,
              summary: computeCashFlowSummary(account, expenses, monthBounds(selectedMonth))
            }))
        : [],
    [isMonthly, accounts, expenses, selectedMonth]
  );

  // ── Annual counterparts (2026-08-02) — same shapes as the monthly ones above, scoped to
  // `analyticsYear` via `inAnalyticsYear` instead of `inSelectedMonth`. ──────────────────────────────────

  const annualCashFlowSummaries = useMemo(
    () =>
      isAnnual
        ? accounts
            .filter((a) => !a.isArchived)
            .map((account) => ({
              account,
              summary: computeCashFlowSummary(account, expenses, yearBounds(analyticsYear))
            }))
        : [],
    [isAnnual, accounts, expenses, analyticsYear]
  );

  const annualGroupData = useMemo(
    () => (isAnnual ? buildGroupData(expenses, inAnalyticsYear, classify, categoryMap, parentCategoryMap, []) : []),
    [isAnnual, expenses, inAnalyticsYear, classify, categoryMap, parentCategoryMap]
  );
  const annualGroupTotal = useMemo(() => annualGroupData.reduce((s, seg) => s + seg.amount, 0), [annualGroupData]);

  const annualSetAsideData = useMemo(
    () => (isAnnual ? buildSetAsideData(expenses, inAnalyticsYear, classify, categoryMap, parentCategoryMap) : []),
    [isAnnual, expenses, inAnalyticsYear, classify, categoryMap, parentCategoryMap]
  );
  const annualSetAsideTotal = useMemo(
    () => annualSetAsideData.reduce((s, seg) => s + seg.amount, 0),
    [annualSetAsideData]
  );

  const annualIncomeData = useMemo(
    () => (isAnnual ? buildIncomeData(expenses, inAnalyticsYear, categoryMap, parentCategoryMap) : []),
    [isAnnual, expenses, inAnalyticsYear, categoryMap, parentCategoryMap]
  );
  const annualIncomeTotal = useMemo(() => annualIncomeData.reduce((s, seg) => s + seg.amount, 0), [annualIncomeData]);

  const annualEvents = useMemo(
    () => (isAnnual ? buildEventsData(expenses, inAnalyticsYear, events, pastEvents, categoryMap) : []),
    [isAnnual, expenses, inAnalyticsYear, events, pastEvents, categoryMap]
  );

  const annualHashtagSummary = useMemo(
    () => (isAnnual ? buildHashtagSummary(expenses, inAnalyticsYear, allEventHashtags) : []),
    [isAnnual, expenses, inAnalyticsYear, allEventHashtags]
  );

  const prevYearGroupData = useMemo(
    () =>
      isAnnual
        ? buildGroupTotals(expenses, (e) => new Date(e.date).getFullYear() === analyticsYear - 1, classify, categoryMap)
        : new Map<string, number>(),
    [isAnnual, expenses, analyticsYear, classify, categoryMap]
  );

  // Annual equivalent of the monthly recap's `txnCount`/`topCategory` — same routine-only scope as
  // `monthlyRecap()` uses for its own top category (see `monthlyInsights.ts`).
  const annualRecap = useMemo(() => {
    if (!isAnnual) return { txnCount: 0, topCategory: undefined as { name: string; amount: number } | undefined };
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
  }, [isAnnual, expenses, analyticsYear, classify, categoryMap]);

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
    () => (isAllTime ? buildGroupData(expenses, inAllTime, classify, categoryMap, parentCategoryMap, []) : []),
    [isAllTime, expenses, inAllTime, classify, categoryMap, parentCategoryMap]
  );
  const allTimeGroupTotal = useMemo(() => allTimeGroupData.reduce((s, seg) => s + seg.amount, 0), [allTimeGroupData]);

  const allTimeSetAsideData = useMemo(
    () => (isAllTime ? buildSetAsideData(expenses, inAllTime, classify, categoryMap, parentCategoryMap) : []),
    [isAllTime, expenses, inAllTime, classify, categoryMap, parentCategoryMap]
  );
  const allTimeSetAsideTotal = useMemo(
    () => allTimeSetAsideData.reduce((s, seg) => s + seg.amount, 0),
    [allTimeSetAsideData]
  );

  const allTimeIncomeData = useMemo(
    () => (isAllTime ? buildIncomeData(expenses, inAllTime, categoryMap, parentCategoryMap) : []),
    [isAllTime, expenses, inAllTime, categoryMap, parentCategoryMap]
  );
  const allTimeIncomeTotal = useMemo(
    () => allTimeIncomeData.reduce((s, seg) => s + seg.amount, 0),
    [allTimeIncomeData]
  );

  const allTimeEvents = useMemo(
    () => (isAllTime ? buildEventsData(expenses, inAllTime, events, pastEvents, categoryMap) : []),
    [isAllTime, expenses, inAllTime, events, pastEvents, categoryMap]
  );

  const allTimeHashtagSummary = useMemo(
    () => (isAllTime ? buildHashtagSummary(expenses, inAllTime, allEventHashtags) : []),
    [isAllTime, expenses, inAllTime, allEventHashtags]
  );

  const allTimeCashFlowSummaries = useMemo(
    () =>
      isAllTime
        ? accounts
            .filter((a) => !a.isArchived)
            .map((account) => ({
              account,
              summary: computeCashFlowSummary(account, expenses, allTimeBounds(nowMs))
            }))
        : [],
    [isAllTime, accounts, expenses, nowMs]
  );

  // Lifetime "true total" (all expense-type transactions, no scope filter) — the All Time counterpart of
  // `monthTotal`/`annualTotal`.
  const allTimeTotal = useMemo(() => {
    if (!isAllTime) return 0;
    let total = 0;
    for (const e of expenses) {
      if (e.type && e.type !== 'expense') continue;
      total += e.amount;
    }
    return total;
  }, [isAllTime, expenses]);

  // Lifetime net (income − expense, transfers excluded) — the All Time counterpart of `recap.net`/
  // `annualSavings.saved`.
  const allTimeNet = useMemo(() => {
    if (!isAllTime) return 0;
    let income = 0;
    let expense = 0;
    for (const e of expenses) {
      const kind = e.type ?? 'expense';
      if (kind === 'transfer') continue;
      if (kind === 'income') income += e.amount;
      else expense += e.amount;
    }
    return income - expense;
  }, [isAllTime, expenses]);

  // Lifetime equivalent of `recap.txnCount`/`topCategory` — unscoped, same routine-only category basis.
  const allTimeRecap = useMemo(() => {
    if (!isAllTime) return { txnCount: 0, topCategory: undefined as { name: string; amount: number } | undefined };
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
  }, [isAllTime, expenses, classify, categoryMap]);

  // Average daily spend over the account's real lifetime — divides `allTimeTotal` by days elapsed since
  // the earliest transaction of any kind (not just expense-type), so a fresh account with one day of data
  // doesn't get diluted by dividing over a longer span than it actually has history for.
  const allTimeAvgPerDay = useMemo(() => {
    if (!isAllTime || expenses.length === 0) return 0;
    let earliest = nowMs;
    for (const e of expenses) {
      if (e.date < earliest) earliest = e.date;
    }
    const days = Math.max(1, Math.floor((nowMs - earliest) / DAY_MS) + 1);
    return allTimeTotal / days;
  }, [isAllTime, expenses, nowMs, allTimeTotal]);

  return {
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
  };
}
