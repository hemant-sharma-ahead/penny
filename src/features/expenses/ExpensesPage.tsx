import { useEffect, useMemo, useRef, useState } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import { useEventMode, EVENT_COLORS, toEventHashtag, normalizeHashtag } from '@/context/EventModeContext';
import type { ActiveEvent, EventSubtype } from '@/context/EventModeContext';
import {
  accountsRepo,
  budgetsRepo,
  expenseCategoriesRepo,
  expensesRepo,
  hashtagsRepo,
  personalIousRepo,
  subscriptionsRepo
} from '@/core/db/repositories';
import { useRepository } from '@/hooks/useRepository';
import type { Budget, Expense, ExpenseCategory, PersonalIou, Subscription, TransactionType } from '@/core/db/types';
import { formatCurrency, formatCompact, formatDateShort, toMonthYearKey } from '@/lib/formatters';
import { ALL_DEFAULT_CATEGORIES, CATEGORY_MIGRATION_MAP, INTENT_GROUP_META } from '@/core/db/defaultCategories';
import { useNavigate } from 'react-router-dom';
import { exportExpensesAsCsv, downloadProtectedZip } from '@/core/export/exportCsv';
import { PATHS } from '@/router/paths';
import { ExpenseForm } from './ExpenseForm';
import { detectSubscriptions, type DetectedSubscription } from '@/core/subscriptions/detector';
import { IouForm } from '../iou/IouForm';

// Evaluated once at module load — safe to use as a min= date attribute
const TODAY_DATE_INPUT = epochToDateInput(Date.now());

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateKey(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateLabel(key: string): string {
  const todayKey = toDateKey(Date.now());
  const yesterdayKey = toDateKey(Date.now() - 86_400_000);
  if (key === todayKey) return 'Today';
  if (key === yesterdayKey) return 'Yesterday';
  const [y, m, d] = key.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mLabel = m ? months[(parseInt(m, 10) - 1) % 12] : '';
  return `${d ?? ''} ${mLabel} ${y ?? ''}`.trim();
}

function epochToDateInput(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function offsetMonth(m: string, delta: number): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y ?? 0, (mo ?? 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(m: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, mo] = m.split('-');
  return `${months[(parseInt(mo ?? '1', 10) - 1) % 12] ?? ''} ${y ?? ''}`.trim();
}

// ── Donut chart ───────────────────────────────────────────────────────────────

interface DonutSegment {
  group: string;
  amount: number;
  color: string;
  label: string;
}

// Defined at module scope so mutation of `cum` is not inside a React render cycle
function buildDonutPlots(segments: DonutSegment[], total: number, C: number, GAP: number) {
  let cum = 0;
  return segments
    .filter((s) => s.amount > 0)
    .map((seg) => {
      const fraction = seg.amount / total;
      const dash = Math.max(fraction * C - GAP, 0);
      const offset = -cum;
      cum += fraction * C;
      return { ...seg, dash, offset };
    });
}

function IntentDonut({ segments, total }: { segments: DonutSegment[]; total: number }) {
  const R = 58;
  const CX = 80;
  const CY = 80;
  const C = 2 * Math.PI * R;
  const plotted = buildDonutPlots(segments, total, C, 2);

  return (
    <svg viewBox="0 0 160 160" width="160" height="160" aria-label="Spending by category">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--color-border)" strokeWidth={20} />
      {plotted.map((seg, i) => (
        <circle
          key={i}
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke={seg.color}
          strokeWidth={20}
          strokeDasharray={`${seg.dash} ${C}`}
          strokeDashoffset={seg.offset}
          transform={`rotate(-90, ${CX}, ${CY})`}
        />
      ))}
      <text x={CX} y={CY - 7} textAnchor="middle" fill="var(--color-text-primary)" fontSize="17" fontWeight="700">
        {formatCompact(total)}
      </text>
      <text x={CX} y={CY + 10} textAnchor="middle" fill="var(--color-text-tertiary)" fontSize="9">
        this month
      </text>
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ExpensesPage() {
  const navigate = useNavigate();
  const { mode } = usePrivacy();
  const {
    events,
    pastEvents,
    allEventHashtags,
    addEvent,
    stopEvent,
    updateEvent,
    reactivateEvent,
    promoteHashtagToEvent,
    demoteEvent
  } = useEventMode();

  const { items: expenses, save: saveExpense, remove: removeExpense } = useRepository(expensesRepo);
  const {
    items: categories,
    loading: categoriesLoading,
    reload: reloadCategories
  } = useRepository(expenseCategoriesRepo);
  const { items: budgets, save: saveBudget } = useRepository(budgetsRepo);
  const { items: hashtags, save: saveHashtag } = useRepository(hashtagsRepo);
  const { items: accounts } = useRepository(accountsRepo);

  const [activeTab, setActiveTab] = useState<'transactions' | 'subscriptions' | 'iou' | 'budgets' | 'analytics'>(
    'transactions'
  );
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [initialTransactionType, setInitialTransactionType] = useState<TransactionType>('expense');
  const [showDial, setShowDial] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [budgetCategoryId, setBudgetCategoryId] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => toMonthYearKey());
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [showEventSheet, setShowEventSheet] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [exportRange, setExportRange] = useState<'this_month' | 'last_3' | 'all_time' | 'custom'>('this_month');
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exportPassword, setExportPassword] = useState('');
  const [showExportPassword, setShowExportPassword] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showNewEventForm, setShowNewEventForm] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventType, setNewEventType] = useState<EventSubtype>('background');
  const [newEventStartDate, setNewEventStartDate] = useState(TODAY_DATE_INPUT);
  const [newEventEndDate, setNewEventEndDate] = useState('');
  const [newEventColor, setNewEventColor] = useState(EVENT_COLORS[0] ?? '#ef4444');
  const [vacationBlockError, setVacationBlockError] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ActiveEvent | null>(null);
  const [editEventName, setEditEventName] = useState('');
  const [editEventStartDate, setEditEventStartDate] = useState('');
  const [editEventEndDate, setEditEventEndDate] = useState('');
  const [editEventColor, setEditEventColor] = useState(EVENT_COLORS[0] ?? '#ef4444');
  const [reactivatingEvent, setReactivatingEvent] = useState<ActiveEvent | null>(null);
  const [reactivateEndDate, setReactivateEndDate] = useState('');
  const [unlinkDialog, setUnlinkDialog] = useState<{
    outOfRangeCount: number;
    onConfirm: () => void;
    onConfirmUnlink: () => void;
  } | null>(null);

  // ── Subscriptions tab state ───────────────────────────────────────────────────
  const { items: stored, save: saveSubscription } = useRepository(subscriptionsRepo);
  const [subActiveTab, setSubActiveTab] = useState<'detected' | 'active'>('detected');
  const [nowMs] = useState(() => Date.now());

  // ── IOU tab state ─────────────────────────────────────────────────────────────
  const { items: ious, save: saveIou, remove: removeIou } = useRepository(personalIousRepo);
  const [iouActiveTab, setIouActiveTab] = useState<'active' | 'history'>('active');
  const [showIouForm, setShowIouForm] = useState(false);
  const [editingIou, setEditingIou] = useState<PersonalIou | null>(null);

  // ── Category seeding (v2 migration) ──────────────────────────────────────────
  const seededRef = useRef(false);
  useEffect(() => {
    if (categoriesLoading) return;
    if (seededRef.current) return;
    // Re-run if flag missing OR if any default category still lacks intentGroup
    // (covers existing installs where demo-cat-* were seeded before step 45)
    const needsMigration =
      !localStorage.getItem('penny_cats_v2') || categories.some((c) => c.isDefault && !c.intentGroup);
    if (!needsMigration) {
      seededRef.current = true;
      return;
    }
    seededRef.current = true;
    const now = Date.now();
    const toSeed = ALL_DEFAULT_CATEGORIES.map((c) => {
      const existing = categories.find((x) => x.id === c.id);
      return { ...c, createdAt: existing?.createdAt ?? now };
    });
    // Patch any existing categories (e.g. demo-cat-*) that still lack intentGroup
    const toPatch = categories
      .filter((c) => !c.intentGroup)
      .map((c) => {
        const targetId = CATEGORY_MIGRATION_MAP[c.name.toLowerCase()];
        const target = ALL_DEFAULT_CATEGORIES.find((x) => x.id === targetId);
        return {
          ...c,
          intentGroup: target?.intentGroup ?? 'other',
          applicableTo: c.applicableTo ?? ('expense' as const)
        };
      });
    Promise.all([...toSeed, ...toPatch].map((c) => expenseCategoriesRepo.put(c)))
      .then(() => {
        localStorage.setItem('penny_cats_v2', '1');
        reloadCategories();
      })
      .catch(() => {});
  }, [categoriesLoading, categories, reloadCategories]);

  // ── Derived ───────────────────────────────────────────────────────────────────

  const expenseCategories = useMemo(
    () => categories.filter((c) => !c.applicableTo || c.applicableTo === 'expense'),
    [categories]
  );

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const grouped = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of expenses) {
      const key = toDateKey(e.date);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, items]) => ({ label: dateLabel(key), items: [...items].sort((a, b) => b.date - a.date) }));
  }, [expenses]);

  const thisMonthTotal = useMemo(() => {
    const month = toMonthYearKey();
    return expenses
      .filter((e) => toMonthYearKey(new Date(e.date)) === month && (!e.type || e.type === 'expense'))
      .reduce((s, e) => s + e.amount, 0);
  }, [expenses]);

  const monthBudgets = useMemo(() => budgets.filter((b) => b.monthYear === toMonthYearKey()), [budgets]);

  const spendByCategory = useMemo(() => {
    const month = toMonthYearKey();
    const map = new Map<string, number>();
    for (const e of expenses) {
      if (toMonthYearKey(new Date(e.date)) !== month) continue;
      if (e.type && e.type !== 'expense') continue;
      map.set(e.categoryId, (map.get(e.categoryId) ?? 0) + e.amount);
    }
    return map;
  }, [expenses]);

  const analyticsMonthBudgets = useMemo(
    () => budgets.filter((b) => b.monthYear === selectedMonth),
    [budgets, selectedMonth]
  );

  const analyticsData = useMemo(() => {
    const byGroup = new Map<string, { amount: number; categories: Map<string, number> }>();
    for (const e of expenses) {
      if (toMonthYearKey(new Date(e.date)) !== selectedMonth) continue;
      if (e.type && e.type !== 'expense') continue;
      // Exclude event expenses — they appear in the Events section
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

  // Events section: expenses that match a known event hashtag, grouped by event
  const eventsThisMonth = useMemo(() => {
    const allEvents = [...events, ...pastEvents];
    const byEventId = new Map<
      string,
      {
        id: string;
        name: string;
        color: string;
        amount: number;
        cats: Map<string, number>;
      }
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
          break; // count each expense once (first matching event wins)
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

  // Non-event hashtags only — event hashtags are shown in the Events section
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

  // Count all expenses (not just this month) linked to each event hashtag
  const linkedCountByEventHashtag = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      for (const tag of e.hashtags) {
        const norm = normalizeHashtag(tag);
        map.set(norm, (map.get(norm) ?? 0) + 1);
      }
    }
    return map;
  }, [expenses]);

  function handleEditEventSave() {
    if (!editingEvent) return;
    const newName = editEventName.trim();
    if (!newName) return;

    const newStartMs = new Date(editEventStartDate).getTime();
    const updates: Partial<Omit<ActiveEvent, 'id'>> = {
      name: newName,
      color: editEventColor,
      startDate: newStartMs
    };

    if (editingEvent.subtype === 'immersive' && editEventEndDate) {
      const newEndMs = new Date(editEventEndDate + 'T23:59:59').getTime();
      updates.endDate = newEndMs;
      const oldEndMs = editingEvent.endDate;
      if (oldEndMs !== undefined && newEndMs < oldEndMs) {
        const eventNorm = normalizeHashtag(editingEvent.hashtag);
        const outOfRange = expenses.filter(
          (e) => e.hashtags.some((t) => normalizeHashtag(t) === eventNorm) && (e.date > newEndMs || e.date < newStartMs)
        );
        if (outOfRange.length > 0) {
          setUnlinkDialog({
            outOfRangeCount: outOfRange.length,
            onConfirm: () => {
              updateEvent(editingEvent.id, updates);
              setEditingEvent(null);
              setUnlinkDialog(null);
            },
            onConfirmUnlink: () => {
              const norm = normalizeHashtag(editingEvent.hashtag);
              outOfRange.forEach((e) => {
                saveExpense({ ...e, hashtags: e.hashtags.filter((t) => normalizeHashtag(t) !== norm) }).catch(() => {});
              });
              updateEvent(editingEvent.id, updates);
              setEditingEvent(null);
              setUnlinkDialog(null);
            }
          });
          return;
        }
      }
    } else if (!editEventEndDate) {
      updates.endDate = undefined;
    }

    updateEvent(editingEvent.id, updates);
    setEditingEvent(null);
  }

  // ── Subscriptions derived ─────────────────────────────────────────────────────

  const detectedSubs = useMemo(() => {
    if (expenses.length === 0) return [];
    const candidates = detectSubscriptions(expenses, nowMs);
    const storedKeys = new Set(stored.map((s) => `${s.merchantCategory}:${s.intervalDays}`));
    return candidates.filter((c) => !storedKeys.has(`${c.merchantCategory}:${c.intervalDays}`));
  }, [expenses, stored, nowMs]);

  const activeSubs = useMemo(() => stored.filter((s) => s.confirmedByUser && s.status !== 'cancelled'), [stored]);

  const subsMonthlyTotal = useMemo(
    () => activeSubs.reduce((sum, s) => sum + (s.detectedAmount / s.intervalDays) * 30, 0),
    [activeSubs]
  );

  function handleSubConfirm(candidate: DetectedSubscription) {
    const sub: Subscription = {
      id: crypto.randomUUID(),
      merchantCategory: candidate.merchantCategory,
      detectedAmount: candidate.detectedAmount,
      intervalDays: candidate.intervalDays,
      status: candidate.status,
      confirmedByUser: true,
      createdAt: nowMs,
      updatedAt: nowMs
    };
    if (candidate.trialEndsAt !== undefined) sub.trialEndsAt = candidate.trialEndsAt;
    if (candidate.lastChargedAt !== undefined) sub.lastChargedAt = candidate.lastChargedAt;
    saveSubscription(sub).catch(() => {});
  }

  function handleSubDismiss(candidate: DetectedSubscription) {
    const sub: Subscription = {
      id: crypto.randomUUID(),
      merchantCategory: candidate.merchantCategory,
      detectedAmount: candidate.detectedAmount,
      intervalDays: candidate.intervalDays,
      status: 'cancelled',
      confirmedByUser: false,
      createdAt: nowMs,
      updatedAt: nowMs
    };
    if (candidate.lastChargedAt !== undefined) sub.lastChargedAt = candidate.lastChargedAt;
    saveSubscription(sub).catch(() => {});
  }

  function handleSubCancel(sub: Subscription) {
    saveSubscription({ ...sub, status: 'cancelled', updatedAt: nowMs }).catch(() => {});
  }

  // ── IOU derived ───────────────────────────────────────────────────────────────

  const iouActive = useMemo(() => ious.filter((i) => !i.isSettled), [ious]);
  const iouHistory = useMemo(
    () =>
      [...ious.filter((i) => i.isSettled)].sort((a, b) => (b.settledAt ?? b.updatedAt) - (a.settledAt ?? a.updatedAt)),
    [ious]
  );
  const iouSortedActive = useMemo(
    () =>
      [...iouActive].sort((a, b) => {
        const aR = a.dueDate !== undefined ? Math.ceil((a.dueDate - nowMs) / 86_400_000) : null;
        const bR = b.dueDate !== undefined ? Math.ceil((b.dueDate - nowMs) / 86_400_000) : null;
        if (aR !== null && aR < 0 && bR !== null && bR < 0) return aR - bR;
        if (aR !== null && aR < 0) return -1;
        if (bR !== null && bR < 0) return 1;
        if (aR !== null && bR !== null) return aR - bR;
        if (aR !== null) return -1;
        if (bR !== null) return 1;
        return b.date - a.date;
      }),
    [iouActive, nowMs]
  );
  const iouTotalLent = useMemo(
    () => iouActive.filter((i) => i.direction === 'lent').reduce((s, i) => s + i.amount, 0),
    [iouActive]
  );
  const iouTotalBorrowed = useMemo(
    () => iouActive.filter((i) => i.direction === 'borrowed').reduce((s, i) => s + i.amount, 0),
    [iouActive]
  );
  const iouOverdueCount = useMemo(
    () => iouActive.filter((i) => i.dueDate !== undefined && i.dueDate < nowMs).length,
    [iouActive, nowMs]
  );

  function iouDueLabel(dueDate: number): { text: string; color: string; bg: string } {
    const days = Math.ceil((dueDate - nowMs) / 86_400_000);
    if (days < 0) return { text: `${-days}d overdue`, color: '#ef4444', bg: '#fef2f2' };
    if (days === 0) return { text: 'Due today', color: '#f59e0b', bg: '#fffbeb' };
    if (days <= 7) return { text: `${days}d left`, color: '#f59e0b', bg: '#fffbeb' };
    return { text: formatDateShort(dueDate), color: '#64748b', bg: 'var(--color-surface-secondary)' };
  }

  function subIntervalLabel(days: number): string {
    if (days === 7) return 'weekly';
    if (days === 14) return 'fortnightly';
    if (days === 30) return 'monthly';
    if (days === 91) return 'quarterly';
    if (days === 365) return 'annual';
    return `every ${days}d`;
  }

  // ── Handlers ──────────────────────────────────────────────────────────────────

  function openAdd(type: TransactionType = 'expense') {
    setInitialTransactionType(type);
    setEditingExpense(null);
    setShowDial(false);
    setShowForm(true);
  }

  function openEdit(expense: Expense) {
    setEditingExpense(expense);
    setShowForm(true);
  }

  async function handleSaveExpense(expense: Expense) {
    await saveExpense(expense);
    for (const tag of expense.hashtags) {
      const existing = hashtags.find((h) => h.name === tag);
      if (existing) {
        await saveHashtag({ ...existing, usageCount: existing.usageCount + 1 });
      } else {
        await saveHashtag({ id: crypto.randomUUID(), name: tag, usageCount: 1, createdAt: Date.now() });
      }
    }
    setShowForm(false);
  }

  async function handleDeleteExpense(id: string) {
    await removeExpense(id);
    setShowForm(false);
  }

  function openBudgetForm(cat: ExpenseCategory, existing?: Budget) {
    setBudgetCategoryId(cat.id);
    setBudgetAmount(existing ? String(existing.limitAmount) : '');
    setShowBudgetForm(true);
  }

  function handleSaveBudget() {
    const amount = parseFloat(budgetAmount);
    if (!budgetCategoryId || isNaN(amount) || amount <= 0) return;
    const existing = monthBudgets.find((b) => b.categoryId === budgetCategoryId);
    saveBudget({
      id: existing?.id ?? crypto.randomUUID(),
      categoryId: budgetCategoryId,
      monthYear: toMonthYearKey(),
      limitAmount: amount,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now()
    })
      .then(() => {
        setShowBudgetForm(false);
        setBudgetCategoryId('');
        setBudgetAmount('');
      })
      .catch(() => {});
  }

  function handleCreateEvent() {
    const name = newEventName.trim();
    if (!name) return;
    if (newEventType === 'immersive' && events.some((e) => e.subtype === 'immersive')) {
      setVacationBlockError(true);
      return;
    }
    setVacationBlockError(false);
    addEvent({
      name,
      subtype: newEventType,
      hashtag: toEventHashtag(name),
      startDate: new Date(newEventStartDate).getTime(),
      ...(newEventType === 'immersive' && newEventEndDate
        ? { endDate: new Date(newEventEndDate + 'T23:59:59').getTime() }
        : {}),
      autoTag: newEventType === 'immersive',
      color: newEventColor
    });
    setNewEventName('');
    setNewEventType('background');
    setNewEventStartDate(TODAY_DATE_INPUT);
    setNewEventEndDate('');
    setNewEventColor(EVENT_COLORS[0] ?? '#ef4444');
    setShowNewEventForm(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-theme flex flex-col gap-1">
        {/* Row 1: title + action icons */}
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-primary">Transactions</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowEventSheet(true)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-surface-2 relative"
              aria-label="Manage events"
            >
              <i className="ti ti-flag-3" style={{ fontSize: 18 }} aria-hidden="true" />
              {events.length > 0 && (
                <span
                  className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full"
                  style={{ backgroundColor: events[0]?.color ?? '#ef4444' }}
                />
              )}
            </button>
            <button
              onClick={() => navigate(PATHS.app.import)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-surface-2"
              aria-label="Import expenses"
            >
              <i className="ti ti-file-import" style={{ fontSize: 18 }} aria-hidden="true" />
            </button>
            <button
              onClick={() => setShowExportSheet(true)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-surface-2"
              aria-label="Export expenses"
            >
              <i className="ti ti-file-export" style={{ fontSize: 18 }} aria-hidden="true" />
            </button>
          </div>
        </div>
        {/* Row 2: this month total + vacation indicator */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-secondary">
            This month:{' '}
            <span className="font-medium text-primary">
              {mode === 'open' ? formatCurrency(thisMonthTotal) : '••••'}
            </span>
          </p>
          {events.find((e) => e.subtype === 'immersive') && (
            <span
              className="text-[10px] font-semibold flex items-center gap-1"
              style={{ color: events.find((e) => e.subtype === 'immersive')?.color }}
            >
              <i className="ti ti-plane" style={{ fontSize: 11 }} aria-hidden="true" />
              Vacation On · {events.find((e) => e.subtype === 'immersive')?.name}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto px-4 border-b border-theme" style={{ scrollbarWidth: 'none' }}>
        {(
          [
            { key: 'transactions', label: 'Transactions' },
            { key: 'subscriptions', label: 'Subscriptions' },
            { key: 'iou', label: 'IOU' },
            { key: 'budgets', label: 'Budgets' },
            { key: 'analytics', label: 'Analytics' }
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="flex-shrink-0 py-2.5 mr-5 text-sm font-medium border-b-2 -mb-px transition-colors"
            style={
              activeTab === key
                ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }
                : { borderColor: 'transparent', color: 'var(--color-text-secondary)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-24">
        {/* ── Transactions tab ── */}
        {activeTab === 'transactions' && (
          <div>
            {grouped.length === 0 ? (
              <div className="p-10 text-center">
                <i className="ti ti-wallet text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
                <p className="text-sm mt-3 text-tertiary">No transactions yet. Tap + to add one.</p>
              </div>
            ) : (
              grouped.map((group) => (
                <div key={group.label}>
                  <div className="px-4 py-2 bg-surface-2 border-b border-theme">
                    <span className="text-xs font-medium uppercase tracking-wide text-tertiary">{group.label}</span>
                  </div>
                  {group.items.map((txn) => {
                    const txnType = txn.type ?? 'expense';
                    const cat = categoryMap.get(txn.categoryId);
                    const iconColor =
                      txnType === 'income' ? '#10b981' : txnType === 'transfer' ? '#3b82f6' : (cat?.color ?? '#6b7280');
                    const icon =
                      txnType === 'income'
                        ? 'ti-arrow-up-circle'
                        : txnType === 'transfer'
                          ? 'ti-arrows-exchange'
                          : (cat?.icon ?? 'ti-dots');
                    const amountColor =
                      txnType === 'income' ? '#10b981' : txnType === 'expense' ? '#ef4444' : '#3b82f6';
                    const prefix = txnType === 'income' ? '+' : txnType === 'transfer' ? '' : '-';
                    const acc = txn.accountId ? accountMap.get(txn.accountId) : undefined;
                    const pmLabel = txn.paymentMode
                      ? ({ cash: 'Cash', upi: 'UPI', card: 'Card', net: 'Net', wallet: 'Wallet' }[txn.paymentMode] ??
                        txn.paymentMode)
                      : undefined;
                    const accLine = [acc?.name, pmLabel ? `(${pmLabel})` : undefined].filter(Boolean).join(' ');
                    return (
                      <button
                        key={txn.id}
                        onClick={() => openEdit(txn)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-theme"
                      >
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${iconColor}18` }}
                        >
                          <i className={`ti ${icon}`} style={{ fontSize: 18, color: iconColor }} aria-hidden="true" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-primary">{txn.description}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {txnType === 'expense' && cat && (
                              <span className="text-[10px] text-tertiary">{cat.name}</span>
                            )}
                            {txnType === 'income' && (
                              <span className="text-[10px] font-medium" style={{ color: '#10b981' }}>
                                Income
                              </span>
                            )}
                            {txnType === 'transfer' && (
                              <span className="text-[10px] font-medium" style={{ color: '#3b82f6' }}>
                                Transfer
                              </span>
                            )}
                            {txn.hashtags.map((tag) => (
                              <span
                                key={tag}
                                className="text-[10px] font-medium"
                                style={{ color: 'var(--color-primary)' }}
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col items-end flex-shrink-0 ml-2 gap-0.5">
                          <span
                            className="text-sm font-semibold"
                            style={{ color: mode === 'open' ? amountColor : 'var(--color-text-primary)' }}
                          >
                            {mode === 'open' ? `${prefix}${formatCurrency(txn.amount)}` : '••••'}
                          </span>
                          {accLine && (
                            <span className="text-[9px] text-tertiary text-right leading-tight max-w-[90px] truncate">
                              {accLine}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Budgets tab ── */}
        {activeTab === 'budgets' && (
          <div className="px-4 py-4 flex flex-col gap-3">
            {expenseCategories.length === 0 && (
              <p className="text-sm text-center mt-8 text-tertiary">Loading categories…</p>
            )}
            {expenseCategories.map((cat) => {
              const budget = monthBudgets.find((b) => b.categoryId === cat.id);
              const spent = spendByCategory.get(cat.id) ?? 0;
              const pct = budget ? Math.min((spent / budget.limitAmount) * 100, 100) : 0;
              const over = !!budget && spent > budget.limitAmount;
              return (
                <div key={cat.id} className="surface rounded-xl px-4 py-3">
                  {/* Header row */}
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${cat.color}18` }}
                    >
                      <i className={`ti ${cat.icon}`} style={{ fontSize: 15, color: cat.color }} aria-hidden="true" />
                    </div>
                    <span className="text-sm font-medium text-primary flex-1 truncate">{cat.name}</span>
                    {budget && (
                      <span
                        className="text-xs flex-shrink-0"
                        style={{ color: over ? '#ef4444' : 'var(--color-text-tertiary)' }}
                      >
                        {mode === 'open' ? formatCurrency(budget.limitAmount) : '••••'}
                      </span>
                    )}
                    <button
                      className="text-xs font-medium underline text-tertiary flex-shrink-0"
                      onClick={() => openBudgetForm(cat, budget)}
                    >
                      {budget ? 'Edit' : 'Set limit'}
                    </button>
                  </div>
                  {/* Bar + spent on one row — only when budget is set */}
                  {budget && (
                    <div className="flex items-center gap-2 mt-2.5">
                      <div className="flex-1 h-2 rounded-full overflow-hidden bg-surface-3">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${pct}%`, backgroundColor: over ? '#ef4444' : cat.color }}
                        />
                      </div>
                      <span
                        className="text-xs flex-shrink-0"
                        style={{ color: over ? '#ef4444' : 'var(--color-text-secondary)' }}
                      >
                        {mode === 'open' ? formatCurrency(spent) : '••••'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Analytics tab ── */}
        {activeTab === 'analytics' && (
          <div className="px-4 py-4 flex flex-col gap-4">
            {/* Month navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setSelectedMonth((m) => offsetMonth(m, -1));
                  setExpandedGroup(null);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-surface-2"
                aria-label="Previous month"
              >
                <i className="ti ti-chevron-left" style={{ fontSize: 18 }} aria-hidden="true" />
              </button>
              <span className="text-sm font-semibold text-primary">{monthLabel(selectedMonth)}</span>
              <button
                onClick={() => {
                  setSelectedMonth((m) => offsetMonth(m, 1));
                  setExpandedGroup(null);
                }}
                disabled={selectedMonth >= toMonthYearKey()}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-surface-2 disabled:opacity-30 disabled:cursor-default"
                aria-label="Next month"
              >
                <i className="ti ti-chevron-right" style={{ fontSize: 18 }} aria-hidden="true" />
              </button>
            </div>

            {analyticsData.length === 0 ? (
              <div className="p-10 text-center">
                <i className="ti ti-chart-donut text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
                <p className="text-sm mt-3 text-tertiary">No expenses in {monthLabel(selectedMonth)}.</p>
              </div>
            ) : (
              <>
                {/* Spend velocity — current month only */}
                {spendVelocity && (
                  <div className="surface rounded-xl p-3.5 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-secondary">
                        {spendVelocity.daysElapsed} of {spendVelocity.daysInMonth} days elapsed
                      </p>
                      <p className="text-sm font-semibold text-primary mt-0.5">
                        On track for {mode === 'open' ? formatCurrency(spendVelocity.projected) : '••••'} this month
                      </p>
                    </div>
                    <div className="flex-shrink-0 flex flex-col items-end gap-1">
                      <div className="w-16 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.round((spendVelocity.daysElapsed / spendVelocity.daysInMonth) * 100)}%`,
                            backgroundColor: 'var(--color-primary)'
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-tertiary">
                        {Math.round((spendVelocity.daysElapsed / spendVelocity.daysInMonth) * 100)}% of month
                      </p>
                    </div>
                  </div>
                )}

                {/* Donut */}
                <div className="surface rounded-2xl p-4 flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <IntentDonut segments={analyticsData} total={analyticsTotal} />
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    {analyticsData.slice(0, 5).map((seg) => (
                      <div key={seg.group} className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                        <span className="text-xs text-secondary truncate flex-1">{seg.label}</span>
                        <span className="text-xs font-medium text-primary flex-shrink-0">
                          {mode === 'open' ? formatCompact(seg.amount) : '••••'}
                        </span>
                      </div>
                    ))}
                    {analyticsData.length > 5 && (
                      <p className="text-[10px] text-tertiary mt-0.5">+{analyticsData.length - 5} more groups</p>
                    )}
                  </div>
                </div>

                {/* Events — above groups, only when present */}
                {eventsThisMonth.length > 0 && (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide -mb-2 text-tertiary">Events</p>
                    {eventsThisMonth.map((ev) => {
                      const isExpanded = expandedEventId === ev.id;
                      return (
                        <div key={ev.id} className="surface rounded-xl overflow-hidden">
                          <button
                            className="w-full px-4 py-3 flex items-center gap-3 text-left"
                            onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                          >
                            <span
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: ev.color }}
                            />
                            <span className="text-sm font-medium text-primary flex-1 truncate">{ev.name}</span>
                            <span className="text-sm font-semibold text-primary flex-shrink-0">
                              {mode === 'open' ? formatCurrency(ev.amount) : '••••'}
                            </span>
                            <i
                              className={`ti ${isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'} flex-shrink-0`}
                              style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}
                              aria-hidden="true"
                            />
                          </button>
                          {isExpanded && (
                            <div className="border-t border-theme">
                              {ev.cats.map((cat) => (
                                <div
                                  key={cat.catId}
                                  className="px-4 py-2.5 flex items-center gap-2 bg-surface-2 border-b border-theme last:border-b-0"
                                >
                                  <div
                                    className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                                    style={{ backgroundColor: `${cat.color}20` }}
                                  >
                                    <i
                                      className={`ti ${cat.icon}`}
                                      style={{ fontSize: 13, color: cat.color }}
                                      aria-hidden="true"
                                    />
                                  </div>
                                  <span className="text-xs text-secondary flex-1 truncate">{cat.name}</span>
                                  <span className="text-xs font-semibold text-primary flex-shrink-0">
                                    {mode === 'open' ? formatCurrency(cat.amount) : '••••'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Groups — compact rows, detail on expand */}
                <p className="text-xs font-semibold uppercase tracking-wide -mb-2 text-tertiary">Spending groups</p>
                <div className="surface rounded-xl overflow-hidden divide-y divide-theme">
                  {analyticsData.map((seg) => {
                    const pct = analyticsTotal > 0 ? (seg.amount / analyticsTotal) * 100 : 0;
                    const prevAmount = prevMonthData.get(seg.group) ?? 0;
                    const delta = prevAmount > 0 ? Math.round(((seg.amount - prevAmount) / prevAmount) * 100) : null;
                    const overBudget = seg.budgetTotal > 0 && seg.amount > seg.budgetTotal;
                    const isExpanded = expandedGroup === seg.group;

                    return (
                      <div key={seg.group}>
                        {/* Compact row */}
                        <button
                          className="w-full px-4 py-3 flex items-center gap-3 text-left"
                          onClick={() => setExpandedGroup(isExpanded ? null : seg.group)}
                        >
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                          <span className="text-sm font-medium text-primary flex-1 truncate">
                            {seg.label} <span className="font-normal text-tertiary text-xs">({Math.round(pct)}%)</span>
                          </span>
                          {delta !== null && (
                            <span
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{
                                color: delta > 0 ? '#ef4444' : '#10b981',
                                backgroundColor: delta > 0 ? '#ef444418' : '#10b98118'
                              }}
                            >
                              {delta > 0 ? '↑' : '↓'}
                              {Math.abs(delta)}%
                            </span>
                          )}
                          {overBudget && (
                            <span
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ color: '#ef4444', backgroundColor: '#ef444418' }}
                            >
                              over
                            </span>
                          )}
                          <span className="text-sm font-semibold text-primary flex-shrink-0">
                            {mode === 'open' ? (
                              seg.budgetTotal > 0 ? (
                                <>
                                  {formatCurrency(seg.amount)}{' '}
                                  <span className="text-xs font-normal text-tertiary">
                                    of {formatCurrency(seg.budgetTotal)}
                                  </span>
                                </>
                              ) : (
                                formatCurrency(seg.amount)
                              )
                            ) : (
                              '••••'
                            )}
                          </span>
                          <i
                            className={`ti ${isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'} flex-shrink-0`}
                            style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}
                            aria-hidden="true"
                          />
                        </button>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div className="px-4 pb-3 bg-surface-2 border-t border-theme">
                            {/* Category drill-down */}
                            <div className="mt-1 flex flex-col gap-1">
                              {seg.cats.map((cat) => {
                                const catPct = seg.amount > 0 ? (cat.amount / seg.amount) * 100 : 0;
                                const catBudgetPct = cat.budgetLimit
                                  ? Math.min((cat.amount / cat.budgetLimit) * 100, 100)
                                  : 0;
                                const catOver = !!cat.budgetLimit && cat.amount > cat.budgetLimit;
                                return (
                                  <div
                                    key={cat.catId}
                                    className="flex flex-col gap-1 py-2 border-t border-theme first:border-t-0"
                                  >
                                    <div className="flex items-center gap-2">
                                      <div
                                        className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                                        style={{ backgroundColor: `${cat.color}20` }}
                                      >
                                        <i
                                          className={`ti ${cat.icon}`}
                                          style={{ fontSize: 11, color: cat.color }}
                                          aria-hidden="true"
                                        />
                                      </div>
                                      <span className="text-xs text-secondary flex-1 truncate">{cat.name}</span>
                                      <span className="text-xs font-semibold text-primary flex-shrink-0">
                                        {mode === 'open' ? (
                                          cat.budgetLimit !== undefined ? (
                                            <>
                                              {formatCurrency(cat.amount)}{' '}
                                              <span className="font-normal text-tertiary">
                                                of {formatCurrency(cat.budgetLimit)}
                                              </span>
                                            </>
                                          ) : (
                                            formatCurrency(cat.amount)
                                          )
                                        ) : (
                                          '••••'
                                        )}
                                      </span>
                                    </div>
                                    {/* One bar: budget if set, share-within-group if not */}
                                    {cat.budgetLimit !== undefined ? (
                                      <div className="h-1 rounded-full bg-surface-3">
                                        <div
                                          className="h-1 rounded-full"
                                          style={{
                                            width: `${catBudgetPct}%`,
                                            backgroundColor: catOver ? '#ef4444' : '#22c55e'
                                          }}
                                        />
                                      </div>
                                    ) : (
                                      <div className="h-1 rounded-full bg-surface-3">
                                        <div
                                          className="h-1 rounded-full"
                                          style={{ width: `${catPct}%`, backgroundColor: cat.color }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Non-event hashtag summary — with promote action */}
                {hashtagSummary.length > 0 && (
                  <div className="surface rounded-xl p-3.5 flex flex-col gap-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Other hashtags</p>
                    {hashtagSummary.map(({ tag, amount }) => (
                      <div key={tag} className="flex items-center gap-2">
                        <span className="text-sm font-medium flex-1" style={{ color: 'var(--color-primary)' }}>
                          #{tag}
                        </span>
                        <span className="text-sm font-semibold text-primary flex-shrink-0">
                          {mode === 'open' ? formatCurrency(amount) : '••••'}
                        </span>
                        <button
                          onClick={() => promoteHashtagToEvent(tag)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 text-tertiary hover:text-primary hover:bg-surface-2"
                          title={`Track #${tag} as an event`}
                          aria-label={`Mark #${tag} as event`}
                        >
                          <i className="ti ti-flag-plus" style={{ fontSize: 15 }} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Subscriptions tab ── */}
        {activeTab === 'subscriptions' && (
          <div className="flex flex-col">
            {/* Inner sub-tabs */}
            <div className="flex px-4 border-b border-theme">
              {(
                [
                  ['detected', `Detected (${detectedSubs.length})`],
                  ['active', `Active (${activeSubs.length})`]
                ] as const
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setSubActiveTab(tab)}
                  className="py-2.5 mr-5 text-sm font-medium border-b-2 -mb-px transition-colors"
                  style={
                    subActiveTab === tab
                      ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }
                      : { borderColor: 'transparent', color: 'var(--color-text-secondary)' }
                  }
                >
                  {label}
                </button>
              ))}
              {activeSubs.length > 0 && (
                <span className="ml-auto self-center text-xs text-secondary">
                  {mode === 'open' ? formatCurrency(subsMonthlyTotal) : '••••'}/mo
                </span>
              )}
            </div>

            {/* Detected */}
            {subActiveTab === 'detected' && (
              <div className="px-4 py-4 flex flex-col gap-3">
                {detectedSubs.length === 0 ? (
                  <div className="p-10 text-center">
                    <i className="ti ti-refresh text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
                    <p className="text-sm font-medium text-secondary mt-3">No new subscriptions detected</p>
                    <p className="text-xs text-tertiary mt-1">
                      {expenses.length === 0
                        ? 'Add expenses first — recurring patterns will surface here.'
                        : 'All detected subscriptions have been reviewed.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-tertiary">
                      {detectedSubs.length} recurring pattern{detectedSubs.length !== 1 ? 's' : ''} found. Confirm ones
                      you recognise.
                    </p>
                    {detectedSubs.map((c) => (
                      <div
                        key={`${c.merchantCategory}:${c.intervalDays}`}
                        className="surface rounded-2xl p-4 flex flex-col gap-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-primary truncate">
                              {c.merchantCategory.replace(/\b\w/g, (ch) => ch.toUpperCase())}
                            </p>
                            <p className="text-xs text-secondary mt-0.5">
                              {mode === 'open' ? formatCurrency(c.detectedAmount) : '••••'} ·{' '}
                              {subIntervalLabel(c.intervalDays)}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            {c.status === 'trial' && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                                Trial
                              </span>
                            )}
                            {c.priceCreep && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                                Price creep
                              </span>
                            )}
                            {c.dormant && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-2 text-secondary">
                                Dormant
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-tertiary">
                          Seen {c.occurrenceCount} time{c.occurrenceCount !== 1 ? 's' : ''}
                          {c.lastChargedAt !== undefined && ` · last ${formatDateShort(c.lastChargedAt)}`}
                          {c.status === 'trial' && c.trialEndsAt !== undefined && (
                            <span className="ml-1 text-blue-500">· trial may end {formatDateShort(c.trialEndsAt)}</span>
                          )}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSubConfirm(c)}
                            className="flex-1 py-2 rounded-xl text-white text-xs font-semibold"
                            style={{ backgroundColor: 'var(--color-primary)' }}
                          >
                            <i className="ti ti-check mr-1" aria-hidden="true" /> Confirm
                          </button>
                          <button
                            onClick={() => handleSubDismiss(c)}
                            className="flex-1 py-2 rounded-xl border border-theme text-secondary text-xs font-semibold"
                          >
                            <i className="ti ti-x mr-1" aria-hidden="true" /> Dismiss
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Active */}
            {subActiveTab === 'active' && (
              <div className="px-4 py-4 flex flex-col gap-3">
                {activeSubs.length === 0 ? (
                  <div className="p-10 text-center">
                    <i className="ti ti-checklist text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
                    <p className="text-sm font-medium text-secondary mt-3">No active subscriptions</p>
                    <p className="text-xs text-tertiary mt-1">
                      Confirm detected subscriptions to track recurring costs.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="bg-surface-2 rounded-xl p-3 flex items-center justify-between">
                      <span className="text-xs text-secondary">Monthly spend</span>
                      <span className="text-sm font-semibold text-primary">
                        {mode === 'open' ? formatCurrency(subsMonthlyTotal) : '••••'}
                      </span>
                    </div>
                    {activeSubs.map((sub) => {
                      const monthly = (sub.detectedAmount / sub.intervalDays) * 30;
                      return (
                        <div key={sub.id} className="surface rounded-2xl p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-primary truncate">
                                  {sub.merchantCategory.replace(/\b\w/g, (ch) => ch.toUpperCase())}
                                </p>
                                {sub.status === 'trial' && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 flex-shrink-0">
                                    Trial
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-secondary mt-0.5">
                                {mode === 'open' ? formatCurrency(sub.detectedAmount) : '••••'} ·{' '}
                                {subIntervalLabel(sub.intervalDays)}
                                {sub.intervalDays !== 30 && mode === 'open' && (
                                  <span className="text-tertiary"> ({formatCurrency(monthly)}/mo)</span>
                                )}
                              </p>
                              {sub.lastChargedAt !== undefined && (
                                <p className="text-xs text-tertiary mt-0.5">
                                  Last charged {formatDateShort(sub.lastChargedAt)}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => handleSubCancel(sub)}
                              className="text-[10px] font-medium text-tertiary border border-theme rounded-lg px-2 py-1 flex-shrink-0"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── IOU tab ── */}
        {activeTab === 'iou' && (
          <div className="flex flex-col pb-24">
            {/* Summary strip */}
            {iouActive.length > 0 && (
              <div className="flex gap-4 px-4 py-3 border-b border-theme">
                {iouTotalLent > 0 && (
                  <span className="text-xs font-medium text-emerald-600">
                    Owed to you: {mode === 'open' ? formatCurrency(iouTotalLent) : '••••'}
                  </span>
                )}
                {iouTotalBorrowed > 0 && (
                  <span className="text-xs font-medium text-red-500">
                    You owe: {mode === 'open' ? formatCurrency(iouTotalBorrowed) : '••••'}
                  </span>
                )}
              </div>
            )}

            {/* Inner sub-tabs */}
            <div className="flex px-4 border-b border-theme">
              {(
                [
                  ['active', `Active (${iouActive.length})`],
                  ['history', `History (${iouHistory.length})`]
                ] as const
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setIouActiveTab(tab)}
                  className="py-2.5 mr-5 text-sm font-medium border-b-2 -mb-px transition-colors"
                  style={
                    iouActiveTab === tab
                      ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }
                      : { borderColor: 'transparent', color: 'var(--color-text-secondary)' }
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Active IOUs */}
            {iouActiveTab === 'active' && (
              <div className="px-4 py-4 flex flex-col gap-3">
                {iouOverdueCount > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2">
                    <i
                      className="ti ti-alert-triangle text-red-500 flex-shrink-0 mt-0.5"
                      style={{ fontSize: 16 }}
                      aria-hidden="true"
                    />
                    <p className="text-xs text-red-700">
                      {iouOverdueCount} {iouOverdueCount === 1 ? 'IOU is' : 'IOUs are'} overdue.
                    </p>
                  </div>
                )}
                {iouSortedActive.length === 0 ? (
                  <div className="p-10 text-center">
                    <i className="ti ti-arrows-exchange text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
                    <p className="text-sm mt-3 text-tertiary">No active IOUs. Tap + to log one.</p>
                  </div>
                ) : (
                  iouSortedActive.map((iou) => {
                    const isLent = iou.direction === 'lent';
                    const accentColor = isLent ? '#10b981' : '#ef4444';
                    const accentBg = isLent ? '#f0fdf4' : '#fef2f2';
                    const due = iou.dueDate !== undefined ? iouDueLabel(iou.dueDate) : null;
                    return (
                      <button
                        key={iou.id}
                        onClick={() => {
                          setEditingIou(iou);
                          setShowIouForm(true);
                        }}
                        className="rounded-2xl p-4 text-left w-full surface"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: accentBg }}
                          >
                            <i
                              className={`ti ${isLent ? 'ti-arrow-up' : 'ti-arrow-down'}`}
                              style={{ fontSize: 18, color: accentColor }}
                              aria-hidden="true"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-semibold truncate text-primary">{iou.description}</p>
                              <p className="text-sm font-semibold flex-shrink-0" style={{ color: accentColor }}>
                                {mode === 'open' ? formatCurrency(iou.amount) : '••••'}
                              </p>
                            </div>
                            <div className="flex items-center justify-between mt-1 gap-2">
                              <p className="text-xs text-tertiary">
                                {isLent ? 'Lent' : 'Borrowed'} {formatDateShort(iou.date)}
                              </p>
                              {due !== null && (
                                <span
                                  className="text-[10px] font-semibold px-2 py-0.5 rounded-lg flex-shrink-0"
                                  style={{ color: due.color, backgroundColor: due.bg }}
                                >
                                  {due.text}
                                </span>
                              )}
                            </div>
                            {iou.notes && <p className="text-xs mt-0.5 truncate text-tertiary">{iou.notes}</p>}
                          </div>
                        </div>
                        <div className="mt-3 pt-3 flex justify-end border-t border-theme">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              saveIou({ ...iou, isSettled: true, settledAt: nowMs, updatedAt: nowMs }).catch(() => {});
                            }}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                            style={{ backgroundColor: `${accentColor}18`, color: accentColor }}
                          >
                            <i className="ti ti-check mr-1" aria-hidden="true" /> Mark settled
                          </button>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {/* IOU History */}
            {iouActiveTab === 'history' && (
              <div className="px-4 py-4 flex flex-col gap-3">
                {iouHistory.length === 0 ? (
                  <div className="p-10 text-center">
                    <i className="ti ti-clock-check text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
                    <p className="text-sm mt-3 text-tertiary">No settled IOUs yet.</p>
                  </div>
                ) : (
                  iouHistory.map((iou) => {
                    const isLent = iou.direction === 'lent';
                    const accentColor = isLent ? '#10b981' : '#ef4444';
                    return (
                      <button
                        key={iou.id}
                        onClick={() => {
                          setEditingIou(iou);
                          setShowIouForm(true);
                        }}
                        className="rounded-2xl p-4 text-left w-full opacity-70 surface"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-surface-2">
                            <i className="ti ti-check text-tertiary" style={{ fontSize: 18 }} aria-hidden="true" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium truncate text-secondary">{iou.description}</p>
                              <p className="text-sm font-semibold flex-shrink-0" style={{ color: accentColor }}>
                                {mode === 'open' ? formatCurrency(iou.amount) : '••••'}
                              </p>
                            </div>
                            <p className="text-xs mt-0.5 text-tertiary">
                              {isLent ? 'Lent' : 'Borrowed'} {formatDateShort(iou.date)}
                              {iou.settledAt !== undefined && ` · settled ${formatDateShort(iou.settledAt)}`}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Speed dial FAB */}
      {activeTab === 'transactions' && (
        <>
          {showDial && <div className="fixed inset-0 z-[9]" onClick={() => setShowDial(false)} aria-hidden="true" />}
          <div
            className="fixed flex flex-col items-end gap-2 z-10"
            style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))', right: '1rem' }}
          >
            {showDial && (
              <div className="flex flex-col items-end gap-2 mb-1">
                {[
                  { type: 'income' as TransactionType, label: 'Income', color: '#10b981', icon: 'ti-arrow-up-circle' },
                  {
                    type: 'transfer' as TransactionType,
                    label: 'Transfer',
                    color: '#3b82f6',
                    icon: 'ti-arrows-exchange'
                  },
                  {
                    type: 'expense' as TransactionType,
                    label: 'Expense',
                    color: '#ef4444',
                    icon: 'ti-arrow-down-circle'
                  }
                ].map(({ type: t, label, color, icon }) => (
                  <button
                    key={t}
                    onClick={() => openAdd(t)}
                    className="flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full shadow-lg text-white text-sm font-semibold"
                    style={{ backgroundColor: color }}
                  >
                    <i className={`ti ${icon}`} style={{ fontSize: 16 }} aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowDial((d) => !d)}
              className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white self-end"
              style={{ backgroundColor: 'var(--color-primary)' }}
              aria-label="Add transaction"
            >
              <i
                className="ti ti-plus"
                style={{ fontSize: 24, transition: 'transform 0.2s', transform: showDial ? 'rotate(45deg)' : 'none' }}
                aria-hidden="true"
              />
            </button>
          </div>
        </>
      )}

      {/* IOU FAB */}
      {activeTab === 'iou' && (
        <button
          onClick={() => {
            setEditingIou(null);
            setShowIouForm(true);
          }}
          className="fixed w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white z-10"
          style={{
            bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
            right: '1rem',
            backgroundColor: 'var(--color-primary)'
          }}
          aria-label="Add IOU"
        >
          <i className="ti ti-plus" style={{ fontSize: 24 }} aria-hidden="true" />
        </button>
      )}

      {/* IOU form modal */}
      {showIouForm && (
        <IouForm
          editing={editingIou}
          onSave={async (iou: PersonalIou) => {
            await saveIou(iou);
            setShowIouForm(false);
          }}
          onDelete={async (id: string) => {
            await removeIou(id);
            setShowIouForm(false);
          }}
          onClose={() => setShowIouForm(false)}
          nowMs={nowMs}
        />
      )}

      {/* ── Export sheet ── */}
      {showExportSheet && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowExportSheet(false)} />
          <div className="relative w-full max-w-sm bg-surface rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-primary">Export expenses</h3>
              <button onClick={() => setShowExportSheet(false)} className="text-tertiary p-1">
                <i className="ti ti-x" style={{ fontSize: 18 }} aria-hidden="true" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {(
                [
                  { value: 'this_month', label: 'This month' },
                  { value: 'last_3', label: 'Last 3 months' },
                  { value: 'all_time', label: 'All time' },
                  { value: 'custom', label: 'Custom range' }
                ] as const
              ).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setExportRange(value)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left"
                  style={{
                    borderColor: exportRange === value ? 'var(--color-primary)' : 'var(--color-border)',
                    backgroundColor: exportRange === value ? 'var(--color-primary)15' : 'transparent'
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                    style={{ borderColor: exportRange === value ? 'var(--color-primary)' : 'var(--color-border)' }}
                  >
                    {exportRange === value && (
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
                    )}
                  </div>
                  <span className="text-sm font-medium text-primary">{label}</span>
                </button>
              ))}
              {exportRange === 'custom' && (
                <div className="flex gap-2 pt-1">
                  <div className="flex-1 flex flex-col gap-1">
                    <label className="text-xs text-tertiary">From</label>
                    <input
                      type="date"
                      value={exportFrom}
                      onChange={(e) => setExportFrom(e.target.value)}
                      className="input-surface border border-theme rounded-xl px-3 py-2 text-sm w-full"
                    />
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <label className="text-xs text-tertiary">To</label>
                    <input
                      type="date"
                      value={exportTo}
                      onChange={(e) => setExportTo(e.target.value)}
                      className="input-surface border border-theme rounded-xl px-3 py-2 text-sm w-full"
                    />
                  </div>
                </div>
              )}
            </div>
            {/* Password input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-tertiary">Export password</label>
              <div className="relative">
                <input
                  type={showExportPassword ? 'text' : 'password'}
                  value={exportPassword}
                  onChange={(e) => setExportPassword(e.target.value)}
                  placeholder="Set a password for the ZIP file"
                  className="input-surface border border-theme rounded-xl px-3 py-2.5 text-sm w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowExportPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-tertiary"
                >
                  <i
                    className={`ti ${showExportPassword ? 'ti-eye-off' : 'ti-eye'}`}
                    style={{ fontSize: 16 }}
                    aria-hidden="true"
                  />
                </button>
              </div>
              <p className="text-[11px] text-tertiary leading-relaxed">
                The ZIP is AES-256 encrypted. This password cannot be recovered — keep it safe.
              </p>
            </div>

            <button
              onClick={async () => {
                if (!exportPassword) return;
                setExporting(true);
                const now = Date.now();
                let startMs = 0;
                let endMs = now;
                let label = 'all-time';
                if (exportRange === 'this_month') {
                  startMs = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
                  label = 'this-month';
                } else if (exportRange === 'last_3') {
                  startMs = new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1).getTime();
                  label = 'last-3-months';
                } else if (exportRange === 'custom') {
                  startMs = exportFrom ? new Date(exportFrom).getTime() : 0;
                  endMs = exportTo ? new Date(exportTo + 'T23:59:59').getTime() : now;
                  label = exportFrom && exportTo ? `${exportFrom}-to-${exportTo}` : 'custom';
                }
                const filtered = expenses.filter((e) => e.date >= startMs && e.date <= endMs);
                const csv = exportExpensesAsCsv(filtered, expenseCategories);
                await downloadProtectedZip(csv, `penny-expenses-${label}.zip`, exportPassword);
                setExporting(false);
                setExportPassword('');
                setShowExportSheet(false);
              }}
              disabled={!exportPassword || exporting || (exportRange === 'custom' && (!exportFrom || !exportTo))}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {exporting ? 'Creating ZIP…' : 'Download protected ZIP'}
            </button>
          </div>
        </div>
      )}

      {/* ── Event management sheet ── */}
      {showEventSheet && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center px-4"
          style={{ paddingTop: 56, paddingBottom: 72 }}
        >
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowEventSheet(false)} />
          <div className="relative w-full max-w-[430px] bg-surface rounded-2xl flex flex-col max-h-full overflow-hidden">
            {/* Sticky header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
              <h3 className="text-base font-semibold text-primary">Events</h3>
              <button
                onClick={() => setShowEventSheet(false)}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center text-tertiary -mr-1"
              >
                <i className="ti ti-x" style={{ fontSize: 18 }} aria-hidden="true" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex flex-col gap-4 px-5 pb-5 overflow-y-auto">
              {/* ── New event toggle / form ── */}
              {showNewEventForm ? (
                <div className="flex flex-col gap-3 bg-surface-2 rounded-xl p-4">
                  <div>
                    <label className="text-xs font-medium text-secondary">Event name</label>
                    <input
                      type="text"
                      className="input-surface mt-1 w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                      placeholder="e.g. Goa Trip, Home Renovation"
                      value={newEventName}
                      onChange={(e) => setNewEventName(e.target.value)}
                      autoFocus
                    />
                    {newEventName.trim() && (
                      <p className="text-[10px] mt-1 text-tertiary">
                        Hashtag: <span style={{ color: 'var(--color-primary)' }}>#{toEventHashtag(newEventName)}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-secondary">Type</label>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      {(['background', 'immersive'] as EventSubtype[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            setNewEventType(t);
                            setVacationBlockError(false);
                          }}
                          className="py-2.5 rounded-xl border-2 text-xs font-medium transition-colors"
                          style={
                            newEventType === t
                              ? {
                                  borderColor: 'var(--color-primary)',
                                  color: 'var(--color-primary)',
                                  backgroundColor: 'var(--color-surface)'
                                }
                              : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
                          }
                        >
                          {t === 'background' ? '🗓 Event' : '✈ Vacation'}
                        </button>
                      ))}
                    </div>
                    {vacationBlockError ? (
                      <p className="text-[10px] mt-1.5 text-red-500">
                        A vacation is already active. Stop it before starting a new one.
                      </p>
                    ) : (
                      <p className="text-[10px] mt-1.5 text-tertiary">
                        {newEventType === 'background'
                          ? 'Open-ended. Tap the hashtag chip in the expense form to associate expenses.'
                          : 'Fixed dates. Every expense is auto-tagged while the vacation is active.'}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-secondary">Start date</label>
                      <input
                        type="date"
                        className="input-surface mt-1 w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                        value={newEventStartDate}
                        onChange={(e) => {
                          setNewEventStartDate(e.target.value);
                          if (newEventEndDate && newEventEndDate < e.target.value) setNewEventEndDate(e.target.value);
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-secondary">End date</label>
                      <input
                        type="date"
                        className="input-surface mt-1 w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] disabled:opacity-40"
                        min={newEventStartDate}
                        value={newEventEndDate}
                        disabled={newEventType === 'background'}
                        onChange={(e) => setNewEventEndDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-secondary">Colour</label>
                    <div className="mt-1.5 flex gap-2">
                      {EVENT_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNewEventColor(c)}
                          className="w-7 h-7 rounded-full border-2 transition-all"
                          style={{
                            backgroundColor: c,
                            borderColor: newEventColor === c ? 'var(--color-text-primary)' : 'transparent',
                            transform: newEventColor === c ? 'scale(1.2)' : 'scale(1)'
                          }}
                          aria-label={`Select colour ${c}`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowNewEventForm(false);
                        setNewEventName('');
                        setVacationBlockError(false);
                      }}
                      className="flex-1 py-2.5 rounded-xl border border-theme text-secondary text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateEvent}
                      disabled={!newEventName.trim() || (newEventType === 'immersive' && !newEventEndDate)}
                      className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-40"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      Start event
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewEventForm(true)}
                  className="w-full py-3 rounded-xl border-2 border-dashed text-sm font-medium transition-colors text-secondary hover:text-primary"
                  style={{ borderColor: 'var(--color-border-strong)' }}
                >
                  + New event
                </button>
              )}

              {/* ── Active events ── */}
              {events.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Active</p>
                  {events.map((ev) =>
                    editingEvent?.id === ev.id ? (
                      <div key={ev.id} className="flex flex-col gap-3 bg-surface-2 rounded-xl p-4">
                        <div>
                          <label className="text-xs font-medium text-secondary">Event name</label>
                          <input
                            type="text"
                            className="input-surface mt-1 w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                            value={editEventName}
                            onChange={(e) => setEditEventName(e.target.value)}
                            autoFocus
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium text-secondary">Start date</label>
                            <input
                              type="date"
                              className="input-surface mt-1 w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                              value={editEventStartDate}
                              onChange={(e) => {
                                setEditEventStartDate(e.target.value);
                                if (editEventEndDate && editEventEndDate < e.target.value)
                                  setEditEventEndDate(e.target.value);
                              }}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-secondary">End date</label>
                            <input
                              type="date"
                              className="input-surface mt-1 w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b] disabled:opacity-40"
                              value={editEventEndDate}
                              min={editEventStartDate}
                              disabled={ev.subtype === 'background'}
                              onChange={(e) => setEditEventEndDate(e.target.value)}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-secondary">Colour</label>
                          <div className="mt-1.5 flex gap-2">
                            {EVENT_COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setEditEventColor(c)}
                                className="w-7 h-7 rounded-full border-2 transition-all"
                                style={{
                                  backgroundColor: c,
                                  borderColor: editEventColor === c ? 'var(--color-text-primary)' : 'transparent',
                                  transform: editEventColor === c ? 'scale(1.2)' : 'scale(1)'
                                }}
                                aria-label={`Select colour ${c}`}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingEvent(null)}
                            className="flex-1 py-2.5 rounded-xl border border-theme text-secondary text-sm font-medium"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleEditEventSave}
                            disabled={!editEventName.trim() || (ev.subtype === 'immersive' && !editEventEndDate)}
                            className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-40"
                            style={{ backgroundColor: 'var(--color-primary)' }}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div key={ev.id} className="surface rounded-xl p-3 flex items-center gap-3">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-primary truncate">{ev.name}</p>
                          <p className="text-[10px] text-tertiary">
                            #{ev.hashtag} · {ev.subtype === 'immersive' ? 'Vacation' : 'Event'} ·{' '}
                            {ev.endDate ? `ends ${new Date(ev.endDate).toLocaleDateString('en-IN')}` : 'Ongoing'}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setEditingEvent(ev);
                            setEditEventName(ev.name);
                            setEditEventColor(ev.color);
                            setEditEventStartDate(epochToDateInput(ev.startDate));
                            setEditEventEndDate(ev.endDate ? epochToDateInput(ev.endDate) : '');
                          }}
                          className="text-xs text-secondary border border-theme rounded-lg px-2.5 py-1 flex-shrink-0"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => stopEvent(ev.id)}
                          className="text-xs text-red-500 border border-red-200 rounded-lg px-2.5 py-1 flex-shrink-0"
                        >
                          Stop
                        </button>
                      </div>
                    )
                  )}
                </div>
              )}

              {/* ── Tracked (past) events ── */}
              {pastEvents.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Tracked</p>
                  {pastEvents.map((ev) => {
                    const linkedCount = linkedCountByEventHashtag.get(normalizeHashtag(ev.hashtag)) ?? 0;
                    const endDatePast = ev.endDate !== undefined && ev.endDate < nowMs;
                    const durationDays =
                      ev.endDate !== undefined
                        ? Math.max(1, Math.round((ev.endDate - ev.startDate) / 86_400_000))
                        : null;
                    const sameDay =
                      ev.endDate !== undefined &&
                      new Date(ev.startDate).toDateString() === new Date(ev.endDate).toDateString();
                    const fmtShort = (ms: number) =>
                      new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                    const fmtFull = (ms: number) =>
                      new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                    const trackedDateLabel = ev.endDate
                      ? sameDay
                        ? `${fmtFull(ev.startDate)} · 1 day`
                        : `${fmtShort(ev.startDate)} – ${fmtFull(ev.endDate)} · ${durationDays} day${durationDays !== 1 ? 's' : ''}`
                      : fmtFull(ev.startDate);

                    // Card header — shared between normal card and reactivate-form card
                    const cardHeader = (
                      <div className="flex items-start gap-3 p-3">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5"
                          style={{ backgroundColor: ev.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-primary truncate">{ev.name}</p>
                          <p className="text-[10px] text-tertiary mt-0.5 truncate">#{ev.hashtag}</p>
                          <p className="text-[10px] text-tertiary truncate">{trackedDateLabel}</p>
                        </div>
                      </div>
                    );

                    // Inline reactivate form — shown when end date is in the past
                    if (reactivatingEvent?.id === ev.id) {
                      const isVacation = ev.subtype === 'immersive';
                      return (
                        <div key={ev.id} className="surface rounded-xl overflow-hidden">
                          {cardHeader}
                          <div className="h-px border-theme mx-3" style={{ borderTopWidth: 1 }} />
                          <div className="flex flex-col gap-3 p-3">
                            <div className="flex items-start gap-2 bg-amber-50 rounded-xl px-3 py-2.5">
                              <i
                                className="ti ti-alert-triangle text-amber-500 flex-shrink-0 mt-0.5"
                                style={{ fontSize: 14 }}
                                aria-hidden="true"
                              />
                              <p className="text-[11px] text-amber-700 leading-snug">
                                {isVacation
                                  ? 'End date has passed. Set a new end date to reactivate.'
                                  : 'End date has passed. Reactivating will clear it so the event continues ongoing.'}
                              </p>
                            </div>
                            {isVacation && (
                              <div>
                                <label className="text-xs font-medium text-secondary">New end date</label>
                                <input
                                  type="date"
                                  className="input-surface mt-1 w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                                  min={TODAY_DATE_INPUT}
                                  value={reactivateEndDate}
                                  onChange={(e) => setReactivateEndDate(e.target.value)}
                                  autoFocus
                                />
                              </div>
                            )}
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setReactivatingEvent(null);
                                  setReactivateEndDate('');
                                }}
                                className="flex-1 py-2 rounded-xl border border-theme text-secondary text-sm font-medium"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => {
                                  if (isVacation) {
                                    if (!reactivateEndDate) return;
                                    const newEndMs = new Date(reactivateEndDate + 'T23:59:59').getTime();
                                    reactivateEvent(ev.id, { endDate: newEndMs });
                                  } else {
                                    reactivateEvent(ev.id);
                                  }
                                  setReactivatingEvent(null);
                                  setReactivateEndDate('');
                                }}
                                disabled={isVacation && !reactivateEndDate}
                                className="flex-1 py-2 rounded-xl text-white text-sm font-medium disabled:opacity-40"
                                style={{ backgroundColor: 'var(--color-primary)' }}
                              >
                                Reactivate
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={ev.id} className="surface rounded-xl">
                        <div className="flex items-start gap-3 p-3">
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5"
                            style={{ backgroundColor: ev.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-primary truncate">{ev.name}</p>
                            <p className="text-[10px] text-tertiary mt-0.5 truncate">#{ev.hashtag}</p>
                            <p className="text-[10px] text-tertiary truncate">{trackedDateLabel}</p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => {
                                if (endDatePast) {
                                  setReactivatingEvent(ev);
                                  setReactivateEndDate(ev.endDate ? epochToDateInput(ev.endDate) : '');
                                } else {
                                  reactivateEvent(ev.id);
                                }
                              }}
                              className="text-xs text-secondary border border-theme rounded-lg px-2.5 py-1"
                            >
                              Reactivate
                            </button>
                            {linkedCount > 0 ? (
                              <span className="text-[10px] text-tertiary border border-theme rounded-lg px-2 py-1">
                                {linkedCount} linked
                              </span>
                            ) : (
                              <button
                                onClick={() => demoteEvent(ev.id)}
                                className="text-xs text-tertiary border border-theme rounded-lg px-2.5 py-1"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Unlink confirmation dialog ── */}
      {unlinkDialog && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center px-4"
          style={{ paddingTop: 56, paddingBottom: 72 }}
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => setUnlinkDialog(null)} />
          <div className="relative w-full max-w-[430px] bg-surface rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                <i className="ti ti-alert-triangle text-amber-500" style={{ fontSize: 20 }} aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-primary">Date range changed</p>
                <p className="text-xs mt-0.5 text-tertiary">
                  {unlinkDialog.outOfRangeCount} transaction
                  {unlinkDialog.outOfRangeCount !== 1 ? 's fall' : ' falls'} outside the new date range.
                </p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-secondary">
              You can keep them linked to this event, or unlink them so they appear in regular analytics instead.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={unlinkDialog.onConfirmUnlink}
                className="w-full py-3 rounded-xl text-white text-sm font-medium"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                Confirm & Unlink
              </button>
              <button
                onClick={unlinkDialog.onConfirm}
                className="w-full py-3 rounded-xl border border-theme text-secondary text-sm font-medium"
              >
                Confirm, keep linked
              </button>
              <button
                onClick={() => setUnlinkDialog(null)}
                className="w-full py-3 rounded-xl text-secondary text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Budget form sheet ── */}
      {showBudgetForm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowBudgetForm(false)} />
          <div className="relative w-full max-w-sm bg-surface rounded-2xl p-5 flex flex-col gap-4">
            <h3 className="text-base font-semibold text-primary">Set monthly budget</h3>
            <div>
              <label className="text-xs font-medium text-secondary">Category</label>
              <select
                className="input-surface mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                value={budgetCategoryId}
                onChange={(e) => setBudgetCategoryId(e.target.value)}
              >
                <option value="">Select category</option>
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-secondary">Monthly limit (₹)</label>
              <input
                type="number"
                inputMode="decimal"
                className="input-surface mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                placeholder="e.g. 5000"
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(e.target.value)}
              />
            </div>
            <button
              onClick={handleSaveBudget}
              className="w-full py-3 rounded-xl text-white text-sm font-medium"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              Save budget
            </button>
          </div>
        </div>
      )}

      {/* ── Transaction form ── */}
      {showForm && (
        <ExpenseForm
          categories={categories}
          hashtags={hashtags}
          editing={editingExpense}
          activeEvents={events}
          initialType={initialTransactionType}
          onSave={handleSaveExpense}
          onDelete={handleDeleteExpense}
          onCategoryCreated={reloadCategories}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
