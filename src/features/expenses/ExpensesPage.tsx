import { useEffect, useMemo, useRef, useState } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import { useEventMode, EVENT_COLORS, toEventHashtag, normalizeHashtag } from '@/context/EventModeContext';
import type { EventSubtype } from '@/context/EventModeContext';
import { budgetsRepo, expenseCategoriesRepo, expensesRepo, hashtagsRepo } from '@/core/db/repositories';
import { useRepository } from '@/hooks/useRepository';
import type { Budget, Expense, ExpenseCategory } from '@/core/db/types';
import { formatCurrency, formatCompact, toMonthYearKey } from '@/lib/formatters';
import { ALL_DEFAULT_CATEGORIES, CATEGORY_MIGRATION_MAP, INTENT_GROUP_META } from '@/core/db/defaultCategories';
import { ExpenseForm } from './ExpenseForm';

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
  const { mode } = usePrivacy();
  const { events, pastEvents, allEventHashtags, addEvent, stopEvent, promoteHashtagToEvent, demoteEvent } =
    useEventMode();

  const { items: expenses, save: saveExpense, remove: removeExpense } = useRepository(expensesRepo);
  const {
    items: categories,
    loading: categoriesLoading,
    reload: reloadCategories
  } = useRepository(expenseCategoriesRepo);
  const { items: budgets, save: saveBudget } = useRepository(budgetsRepo);
  const { items: hashtags, save: saveHashtag } = useRepository(hashtagsRepo);

  const [activeTab, setActiveTab] = useState<'expenses' | 'budgets' | 'analytics'>('expenses');
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [budgetCategoryId, setBudgetCategoryId] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => toMonthYearKey());
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [showEventSheet, setShowEventSheet] = useState(false);
  const [showNewEventForm, setShowNewEventForm] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventType, setNewEventType] = useState<EventSubtype>('background');
  const [newEventEndDate, setNewEventEndDate] = useState('');
  const [newEventColor, setNewEventColor] = useState(EVENT_COLORS[0] ?? '#ef4444');

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

  const grouped = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of expenses) {
      if (e.type && e.type !== 'expense') continue;
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

  // ── Handlers ──────────────────────────────────────────────────────────────────

  function openAdd() {
    setEditingExpense(null);
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
    addEvent({
      name,
      subtype: newEventType,
      hashtag: toEventHashtag(name),
      startDate: Date.now(),
      endDate:
        newEventType === 'immersive' && newEventEndDate
          ? new Date(newEventEndDate).getTime() + 86_400_000 - 1
          : undefined,
      autoTag: newEventType === 'immersive',
      color: newEventColor
    });
    setNewEventName('');
    setNewEventType('background');
    setNewEventEndDate('');
    setNewEventColor(EVENT_COLORS[0] ?? '#ef4444');
    setShowNewEventForm(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-theme">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold text-primary">Expenses</h2>
            <p className="text-sm mt-0.5 text-secondary">
              This month:{' '}
              <span className="font-medium text-primary">
                {mode === 'open' ? formatCurrency(thisMonthTotal) : '••••'}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
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
              className="w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-surface-2"
              aria-label="Import expenses (coming soon)"
              title="Import (coming in step 46)"
            >
              <i className="ti ti-file-import" style={{ fontSize: 18 }} aria-hidden="true" />
            </button>
            <button
              className="w-8 h-8 flex items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-surface-2"
              aria-label="Export expenses (coming soon)"
              title="Export (coming in step 47)"
            >
              <i className="ti ti-file-export" style={{ fontSize: 18 }} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-4 border-b border-theme">
        {(['expenses', 'budgets', 'analytics'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="py-2.5 mr-5 text-sm font-medium border-b-2 -mb-px capitalize transition-colors"
            style={
              activeTab === tab
                ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }
                : { borderColor: 'transparent', color: 'var(--color-text-secondary)' }
            }
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-24">
        {/* ── Expenses tab ── */}
        {activeTab === 'expenses' && (
          <div>
            {grouped.length === 0 ? (
              <div className="p-10 text-center">
                <i className="ti ti-wallet text-tertiary" style={{ fontSize: 44 }} aria-hidden="true" />
                <p className="text-sm mt-3 text-tertiary">No expenses yet. Tap + to add one.</p>
              </div>
            ) : (
              grouped.map((group) => (
                <div key={group.label}>
                  <div className="px-4 py-2 bg-surface-2 border-b border-theme">
                    <span className="text-xs font-medium uppercase tracking-wide text-tertiary">{group.label}</span>
                  </div>
                  {group.items.map((expense) => {
                    const cat = categoryMap.get(expense.categoryId);
                    return (
                      <button
                        key={expense.id}
                        onClick={() => openEdit(expense)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-theme"
                      >
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${cat?.color ?? '#6b7280'}18` }}
                        >
                          <i
                            className={`ti ${cat?.icon ?? 'ti-dots'}`}
                            style={{ fontSize: 18, color: cat?.color ?? '#6b7280' }}
                            aria-hidden="true"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-primary">{expense.description}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {cat && <span className="text-[10px] text-tertiary">{cat.name}</span>}
                            {expense.hashtags.map((tag) => (
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
                        <span className="text-sm font-semibold flex-shrink-0 ml-2 text-primary">
                          {mode === 'open' ? formatCurrency(expense.amount) : '••••'}
                        </span>
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
      </div>

      {/* FAB — add expense */}
      {activeTab === 'expenses' && (
        <button
          onClick={openAdd}
          className="fixed w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white z-10"
          style={{
            bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
            right: '1rem',
            backgroundColor: 'var(--color-primary)'
          }}
          aria-label="Add expense"
        >
          <i className="ti ti-plus" style={{ fontSize: 24 }} aria-hidden="true" />
        </button>
      )}

      {/* ── Event management sheet ── */}
      {showEventSheet && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowEventSheet(false)} />
          <div className="relative w-full max-w-sm bg-surface rounded-2xl p-5 flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-primary">Events</h3>
              <button onClick={() => setShowEventSheet(false)} className="text-tertiary p-1">
                <i className="ti ti-x" style={{ fontSize: 18 }} aria-hidden="true" />
              </button>
            </div>

            {/* Active events list */}
            {events.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Active</p>
                {events.map((ev) => (
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
                      onClick={() => stopEvent(ev.id)}
                      className="text-xs text-red-500 border border-red-200 rounded-lg px-2.5 py-1 flex-shrink-0"
                    >
                      Stop
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Past / promoted events */}
            {pastEvents.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Tracked</p>
                {pastEvents.map((ev) => (
                  <div key={ev.id} className="surface rounded-xl p-3 flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary truncate">{ev.name}</p>
                      <p className="text-[10px] text-tertiary">#{ev.hashtag} · expenses kept separate in analytics</p>
                    </div>
                    <button
                      onClick={() => demoteEvent(ev.id)}
                      className="text-xs text-tertiary border border-theme rounded-lg px-2.5 py-1 flex-shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {events.length === 0 && pastEvents.length === 0 && !showNewEventForm && (
              <p className="text-sm text-center text-tertiary py-2">
                No active events. Start one to auto-tag your expenses.
              </p>
            )}

            {/* New event form */}
            {showNewEventForm ? (
              <div className="flex flex-col gap-3 bg-surface-2 rounded-xl p-4">
                <div>
                  <label className="text-xs font-medium text-secondary">Event name</label>
                  <input
                    type="text"
                    className="input-surface mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
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
                        onClick={() => setNewEventType(t)}
                        className="py-2.5 rounded-xl border-2 text-xs font-medium transition-colors"
                        style={
                          newEventType === t
                            ? {
                                borderColor: 'var(--color-primary)',
                                color: 'var(--color-primary)',
                                backgroundColor: 'var(--color-surface-secondary)'
                              }
                            : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
                        }
                      >
                        {t === 'background' ? '🗓 Event' : '✈ Vacation'}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] mt-1.5 text-tertiary">
                    {newEventType === 'background'
                      ? 'Open-ended. Tap the hashtag chip in the expense form to associate expenses.'
                      : 'Fixed dates. Every expense is auto-tagged while the vacation is active.'}
                  </p>
                </div>

                {newEventType === 'immersive' && (
                  <div>
                    <label className="text-xs font-medium text-secondary">End date</label>
                    <input
                      type="date"
                      className="input-surface mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                      min={TODAY_DATE_INPUT}
                      value={newEventEndDate}
                      onChange={(e) => setNewEventEndDate(e.target.value)}
                    />
                  </div>
                )}

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

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setShowNewEventForm(false)}
                    className="flex-1 py-2.5 rounded-xl border border-theme text-secondary text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateEvent}
                    disabled={!newEventName.trim()}
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
                className="w-full py-3 rounded-xl border-2 border-dashed text-sm font-medium transition-colors border-theme text-secondary hover:text-primary"
                style={{ borderColor: 'var(--color-border-strong)' }}
              >
                + New event
              </button>
            )}
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

      {/* ── Expense form ── */}
      {showForm && (
        <ExpenseForm
          categories={expenseCategories}
          hashtags={hashtags}
          editing={editingExpense}
          activeEvents={events}
          onSave={handleSaveExpense}
          onDelete={handleDeleteExpense}
          onCategoryCreated={reloadCategories}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
