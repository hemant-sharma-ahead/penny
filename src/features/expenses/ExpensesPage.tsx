import { useEffect, useMemo, useState } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';
import { budgetsRepo, expenseCategoriesRepo, expensesRepo, hashtagsRepo } from '@/core/db/repositories';
import { useRepository } from '@/hooks/useRepository';
import type { Budget, Expense, ExpenseCategory } from '@/core/db/types';
import { formatCurrency, toMonthYearKey } from '@/lib/formatters';
import { ExpenseForm } from './ExpenseForm';

const DEFAULT_CATEGORIES: ExpenseCategory[] = [
  { id: 'cat-food', name: 'Food & Dining', icon: 'ti-pizza', color: '#ef4444', isDefault: true, createdAt: 0 },
  { id: 'cat-transport', name: 'Transport', icon: 'ti-car', color: '#f59e0b', isDefault: true, createdAt: 0 },
  { id: 'cat-shopping', name: 'Shopping', icon: 'ti-shopping-cart', color: '#8b5cf6', isDefault: true, createdAt: 0 },
  { id: 'cat-bills', name: 'Bills & Utilities', icon: 'ti-receipt', color: '#3b82f6', isDefault: true, createdAt: 0 },
  { id: 'cat-health', name: 'Health', icon: 'ti-heart', color: '#10b981', isDefault: true, createdAt: 0 },
  {
    id: 'cat-entertainment',
    name: 'Entertainment',
    icon: 'ti-device-tv',
    color: '#ec4899',
    isDefault: true,
    createdAt: 0
  },
  { id: 'cat-other', name: 'Other', icon: 'ti-dots', color: '#6b7280', isDefault: true, createdAt: 0 }
];

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

const inputStyle = {
  backgroundColor: 'var(--color-surface-secondary)',
  color: 'var(--color-text-primary)',
  borderColor: 'var(--color-border)'
};

export function ExpensesPage() {
  const { mode } = usePrivacy();

  const { items: expenses, save: saveExpense, remove: removeExpense } = useRepository(expensesRepo);
  const {
    items: categories,
    loading: categoriesLoading,
    reload: reloadCategories
  } = useRepository(expenseCategoriesRepo);
  const { items: budgets, save: saveBudget } = useRepository(budgetsRepo);
  const { items: hashtags, save: saveHashtag } = useRepository(hashtagsRepo);

  const [activeTab, setActiveTab] = useState<'expenses' | 'budgets'>('expenses');
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [budgetCategoryId, setBudgetCategoryId] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');

  useEffect(() => {
    if (categoriesLoading || categories.length > 0) return;
    let cancelled = false;
    const now = Date.now();
    Promise.all(DEFAULT_CATEGORIES.map((c) => expenseCategoriesRepo.put({ ...c, createdAt: now })))
      .then(() => {
        if (!cancelled) reloadCategories();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [categoriesLoading, categories.length, reloadCategories]);

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
      .map(([key, items]) => ({
        label: dateLabel(key),
        items: [...items].sort((a, b) => b.date - a.date)
      }));
  }, [expenses]);

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const thisMonthTotal = useMemo(() => {
    const month = toMonthYearKey();
    return expenses.filter((e) => toMonthYearKey(new Date(e.date)) === month).reduce((s, e) => s + e.amount, 0);
  }, [expenses]);

  const monthBudgets = useMemo(() => budgets.filter((b) => b.monthYear === toMonthYearKey()), [budgets]);

  const spendByCategory = useMemo(() => {
    const month = toMonthYearKey();
    const map = new Map<string, number>();
    for (const e of expenses) {
      if (toMonthYearKey(new Date(e.date)) !== month) continue;
      map.set(e.categoryId, (map.get(e.categoryId) ?? 0) + e.amount);
    }
    return map;
  }, [expenses]);

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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <h2 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Expenses
        </h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
          This month:{' '}
          <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {mode === 'open' ? formatCurrency(thisMonthTotal) : '••••'}
          </span>
        </p>
      </div>

      {/* Tabs */}
      <div className="flex px-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {(['expenses', 'budgets'] as const).map((tab) => (
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
                <i
                  className="ti ti-wallet"
                  style={{ fontSize: 44, color: 'var(--color-text-tertiary)' }}
                  aria-hidden="true"
                />
                <p className="text-sm mt-3" style={{ color: 'var(--color-text-tertiary)' }}>
                  No expenses yet. Tap + to add one.
                </p>
              </div>
            ) : (
              grouped.map((group) => (
                <div key={group.label}>
                  <div
                    className="px-4 py-2"
                    style={{
                      backgroundColor: 'var(--color-surface-secondary)',
                      borderBottom: '1px solid var(--color-border)'
                    }}
                  >
                    <span
                      className="text-xs font-medium uppercase tracking-wide"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {group.label}
                    </span>
                  </div>
                  {group.items.map((expense) => {
                    const cat = categoryMap.get(expense.categoryId);
                    return (
                      <button
                        key={expense.id}
                        onClick={() => openEdit(expense)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left"
                        style={{ borderBottom: '1px solid var(--color-border)' }}
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
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                            {expense.description}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {cat && (
                              <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                                {cat.name}
                              </span>
                            )}
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
                        <span
                          className="text-sm font-semibold flex-shrink-0 ml-2"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
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
            {categories.length === 0 && (
              <p className="text-sm text-center mt-8" style={{ color: 'var(--color-text-tertiary)' }}>
                Loading categories…
              </p>
            )}
            {categories.map((cat) => {
              const budget = monthBudgets.find((b) => b.categoryId === cat.id);
              const spent = spendByCategory.get(cat.id) ?? 0;
              const pct = budget ? Math.min((spent / budget.limitAmount) * 100, 100) : 0;
              const over = !!budget && spent > budget.limitAmount;

              return (
                <div
                  key={cat.id}
                  className="rounded-xl p-4"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)'
                  }}
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${cat.color}18` }}
                      >
                        <i className={`ti ${cat.icon}`} style={{ fontSize: 15, color: cat.color }} aria-hidden="true" />
                      </div>
                      <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {cat.name}
                      </span>
                    </div>
                    <button
                      className="text-xs font-medium underline"
                      style={{ color: 'var(--color-text-tertiary)' }}
                      onClick={() => openBudgetForm(cat, budget)}
                    >
                      {budget ? 'Edit' : 'Set limit'}
                    </button>
                  </div>
                  {budget ? (
                    <>
                      <div
                        className="h-2 rounded-full overflow-hidden"
                        style={{ backgroundColor: 'var(--color-surface-tertiary)' }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${pct}%`, backgroundColor: over ? '#ef4444' : cat.color }}
                        />
                      </div>
                      <div className="flex justify-between mt-1.5">
                        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                          {mode === 'open' ? formatCurrency(spent) : '••••'} spent
                        </span>
                        <span
                          className={`text-xs font-medium ${over ? 'text-red-500' : ''}`}
                          style={over ? undefined : { color: 'var(--color-text-tertiary)' }}
                        >
                          {mode === 'open' ? formatCurrency(budget.limitAmount) : '••••'} limit
                          {over && ' · over budget'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      No budget set for this month
                    </p>
                  )}
                </div>
              );
            })}
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

      {/* Budget slide-up form */}
      {showBudgetForm && (
        <div
          className="fixed inset-0 z-60 flex items-end"
          style={{ paddingBottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowBudgetForm(false)} />
          <div
            className="relative w-full rounded-t-2xl p-5 flex flex-col gap-4"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            <h3 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Set monthly budget
            </h3>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                Category
              </label>
              <select
                className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                style={inputStyle}
                value={budgetCategoryId}
                onChange={(e) => setBudgetCategoryId(e.target.value)}
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                Monthly limit (₹)
              </label>
              <input
                type="number"
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                style={inputStyle}
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

      {/* Expense add/edit form */}
      {showForm && (
        <ExpenseForm
          categories={categories}
          hashtags={hashtags}
          editing={editingExpense}
          onSave={handleSaveExpense}
          onDelete={handleDeleteExpense}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
