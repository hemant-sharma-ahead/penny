import { useMemo, useState } from 'react';
import type { Expense, ExpenseCategory, Hashtag } from '@/core/db/types';
import type { ActiveEvent } from '@/context/EventModeContext';
import { expenseCategoriesRepo } from '@/core/db/repositories';
import { INTENT_GROUP_META } from '@/core/db/defaultCategories';

interface Props {
  categories: ExpenseCategory[];
  hashtags: Hashtag[];
  editing: Expense | null;
  activeEvents: ActiveEvent[];
  onSave: (expense: Expense) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCategoryCreated: () => void;
  onClose: () => void;
}

const CAT_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6b7280'];

const PAYMENT_MODES = [
  { id: 'cash', label: 'Cash', icon: 'ti-cash', color: '#22c55e' },
  { id: 'upi', label: 'UPI', icon: 'ti-qrcode', color: '#7c3aed' },
  { id: 'card', label: 'Card', icon: 'ti-credit-card', color: '#3b82f6' },
  { id: 'net', label: 'Net', icon: 'ti-building-bank', color: '#0ea5e9' },
  { id: 'wallet', label: 'Wallet', icon: 'ti-wallet', color: '#f97316' }
];

function epochToDateInput(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseTags(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, '').trim().toLowerCase())
    .filter(Boolean);
}

export function ExpenseForm({
  categories,
  hashtags,
  editing,
  activeEvents,
  onSave,
  onDelete,
  onCategoryCreated,
  onClose
}: Props) {
  const defaultCategoryId = categories[0]?.id ?? '';

  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? defaultCategoryId);
  const [paymentMode, setPaymentMode] = useState(editing?.paymentMode ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [date, setDate] = useState(() => (editing ? epochToDateInput(editing.date) : epochToDateInput(Date.now())));
  const [tagInput, setTagInput] = useState(() => {
    if (editing) return editing.hashtags.join(' ');
    const autoTags = activeEvents.filter((e) => e.autoTag).map((e) => e.hashtag.toLowerCase());
    return autoTags.length > 0 ? autoTags.join(' ') + ' ' : '';
  });
  const [isRecurring, setIsRecurring] = useState(editing?.isRecurring ?? false);
  const [intervalDays, setIntervalDays] = useState(String(editing?.recurringIntervalDays ?? 30));
  const [saving, setSaving] = useState(false);

  // New category form
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('ti-dots');
  const [newCatColor, setNewCatColor] = useState('#6b7280');
  const [savingCat, setSavingCat] = useState(false);

  const activeTags = parseTags(tagInput);
  const tagParts = tagInput.split(/[\s,]+/);
  const lastWord = (tagParts[tagParts.length - 1] ?? '').replace(/^#/, '');
  const tagSuggestions =
    lastWord.length > 0
      ? hashtags.filter((h) => h.name.startsWith(lastWord) && !activeTags.includes(h.name)).slice(0, 5)
      : [];

  const groupedCategories = useMemo(() => {
    const byGroup = new Map<string, ExpenseCategory[]>();
    for (const cat of categories) {
      const group = cat.intentGroup ?? 'other';
      const arr = byGroup.get(group) ?? [];
      arr.push(cat);
      byGroup.set(group, arr);
    }
    return Object.entries(INTENT_GROUP_META)
      .filter(([g]) => g !== 'income' && g !== 'transfers')
      .flatMap(([group, meta]) => {
        const cats = byGroup.get(group) ?? [];
        return cats.length > 0 ? [{ group, label: meta.label, color: meta.color, cats }] : [];
      });
  }, [categories]);

  function applyTagSuggestion(name: string) {
    const parts = tagInput.split(/[\s,]+/);
    parts[parts.length - 1] = name;
    setTagInput(parts.join(' ') + ' ');
  }

  function toggleEventTag(ev: ActiveEvent) {
    const tag = ev.hashtag.toLowerCase();
    if (activeTags.includes(tag)) {
      setTagInput(activeTags.filter((t) => t !== tag).join(' ') + ' ');
    } else {
      setTagInput((prev) => (prev.trim() ? prev.trim() + ' ' + tag + ' ' : tag + ' '));
    }
  }

  function handleSave() {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0 || !description.trim() || !categoryId) return;
    setSaving(true);
    const now = Date.now();
    onSave({
      id: editing?.id ?? crypto.randomUUID(),
      amount: amt,
      categoryId,
      description: description.trim(),
      date: new Date(date).getTime(),
      hashtags: parseTags(tagInput),
      isRecurring,
      ...(isRecurring ? { recurringIntervalDays: parseInt(intervalDays, 10) || 30 } : {}),
      ...(paymentMode ? { paymentMode } : {}),
      type: editing?.type ?? 'expense',
      source: editing?.source ?? 'manual',
      createdAt: editing?.createdAt ?? now,
      updatedAt: now
    })
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  async function handleCreateCategory() {
    const name = newCatName.trim();
    if (!name) return;
    setSavingCat(true);
    const newCat: ExpenseCategory = {
      id: `cat-custom-${crypto.randomUUID().slice(0, 8)}`,
      name,
      icon: newCatIcon || 'ti-dots',
      color: newCatColor,
      isDefault: false,
      intentGroup: 'other',
      applicableTo: 'expense',
      createdAt: Date.now()
    };
    try {
      await expenseCategoriesRepo.put(newCat);
      setCategoryId(newCat.id);
      onCategoryCreated();
      setShowNewCat(false);
      setNewCatName('');
      setNewCatIcon('ti-dots');
      setNewCatColor('#6b7280');
    } finally {
      setSavingCat(false);
    }
  }

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-[430px] bg-surface rounded-2xl p-5 flex flex-col gap-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-primary">{editing ? 'Edit expense' : 'Add expense'}</h3>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-tertiary"
          >
            <i className="ti ti-x" style={{ fontSize: 20 }} aria-hidden="true" />
          </button>
        </div>

        {/* Amount + Date */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-secondary">Amount (₹)</label>
            <input
              type="number"
              inputMode="decimal"
              className="input-surface mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-secondary">Date</label>
            <input
              type="date"
              className="input-surface mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        {/* Payment mode */}
        <div>
          <label className="text-xs font-medium text-secondary">Payment mode</label>
          <div className="mt-1 flex gap-2 overflow-x-auto pb-0.5">
            {PAYMENT_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setPaymentMode((prev) => (prev === m.id ? '' : m.id))}
                className="flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors w-[58px]"
                style={
                  paymentMode === m.id
                    ? { borderColor: m.color, backgroundColor: 'var(--color-surface-secondary)' }
                    : { borderColor: 'transparent', backgroundColor: 'var(--color-surface-secondary)' }
                }
              >
                <i className={`ti ${m.icon}`} style={{ fontSize: 18, color: m.color }} aria-hidden="true" />
                <span className="text-[9px] font-medium leading-tight text-secondary">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Category — grouped by intent */}
        <div>
          <label className="text-xs font-medium text-secondary">Category</label>
          <div className="mt-2 flex flex-col gap-3">
            {groupedCategories.map(({ group, label, color, cats }) => (
              <div key={group}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>
                    {label}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {cats.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryId(cat.id)}
                      className="flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors"
                      style={
                        categoryId === cat.id
                          ? { borderColor: cat.color, backgroundColor: 'var(--color-surface-secondary)' }
                          : { borderColor: 'transparent', backgroundColor: 'var(--color-surface-secondary)' }
                      }
                    >
                      <i className={`ti ${cat.icon}`} style={{ fontSize: 18, color: cat.color }} aria-hidden="true" />
                      <span className="text-[9px] font-medium text-center leading-tight text-secondary line-clamp-1">
                        {cat.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* New category inline form */}
            {showNewCat ? (
              <div className="bg-surface-2 rounded-xl p-3 flex flex-col gap-2.5 border border-theme">
                <input
                  type="text"
                  className="input-surface w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                  placeholder="Category name"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  autoFocus
                />
                <div>
                  <p className="text-[10px] text-secondary mb-1">Icon name (Tabler)</p>
                  <input
                    type="text"
                    className="input-surface w-full rounded-xl border px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                    placeholder="ti-star, ti-home, ti-bolt…"
                    value={newCatIcon}
                    onChange={(e) => setNewCatIcon(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-secondary flex-shrink-0">Colour</p>
                  {CAT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewCatColor(c)}
                      className="w-6 h-6 rounded-full border-2 flex-shrink-0 transition-transform"
                      style={{
                        backgroundColor: c,
                        borderColor: newCatColor === c ? 'var(--color-text-primary)' : 'transparent',
                        transform: newCatColor === c ? 'scale(1.2)' : 'scale(1)'
                      }}
                      aria-label={`Colour ${c}`}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewCat(false)}
                    className="flex-1 py-2 rounded-xl border border-theme text-xs font-medium text-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateCategory()}
                    disabled={!newCatName.trim() || savingCat}
                    className="flex-1 py-2 rounded-xl text-white text-xs font-medium disabled:opacity-40"
                    style={{ backgroundColor: newCatColor }}
                  >
                    {savingCat ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowNewCat(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-tertiary hover:text-secondary mt-0.5"
              >
                <i className="ti ti-plus" style={{ fontSize: 13 }} aria-hidden="true" />
                New category
              </button>
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-medium text-secondary">Description</label>
          <input
            type="text"
            className="input-surface mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            placeholder="What was this for?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Active event chips */}
        {activeEvents.length > 0 && (
          <div>
            <label className="text-xs font-medium text-secondary">Active events</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {activeEvents.map((ev) => {
                const isTagged = activeTags.includes(ev.hashtag.toLowerCase());
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => toggleEventTag(ev)}
                    className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border-2 transition-colors"
                    style={
                      isTagged
                        ? { borderColor: ev.color, backgroundColor: `${ev.color}18`, color: ev.color }
                        : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
                    }
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                    {ev.name}
                    {ev.autoTag && !isTagged && <span className="text-[9px] opacity-60">auto</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Hashtags */}
        <div>
          <label className="text-xs font-medium text-secondary">Tags</label>
          <input
            type="text"
            className="input-surface mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            placeholder="emi groceries travel"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
          />
          {tagSuggestions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {tagSuggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="text-xs rounded-full px-2.5 py-0.5 bg-surface-3 text-secondary"
                  onClick={() => applyTagSuggestion(s.name)}
                >
                  #{s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recurring toggle */}
        <div className={`grid gap-3 ${isRecurring ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <div>
            <label className="text-xs font-medium text-secondary">Recurring</label>
            <div className="mt-1 flex items-center justify-between rounded-xl border border-theme px-3 py-3">
              <span className="text-xs text-tertiary">Bills, EMIs</span>
              <button
                type="button"
                onClick={() => setIsRecurring((v) => !v)}
                className="w-11 h-6 rounded-full transition-colors flex-shrink-0"
                style={
                  isRecurring ? { backgroundColor: '#00a86b' } : { backgroundColor: 'var(--color-surface-tertiary)' }
                }
                aria-label="Toggle recurring"
              >
                <span
                  className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    isRecurring ? 'translate-x-[22px]' : 'translate-x-[2px]'
                  }`}
                />
              </button>
            </div>
          </div>
          {isRecurring && (
            <div>
              <label className="text-xs font-medium text-secondary">Every (days)</label>
              <input
                type="number"
                inputMode="numeric"
                className="input-surface mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          {editing && (
            <button
              type="button"
              onClick={() => editing && onDelete(editing.id).catch(() => {})}
              className="flex-1 py-3 rounded-xl border border-red-200 text-red-500 text-sm font-medium"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {saving ? 'Saving…' : editing ? 'Update' : 'Add expense'}
          </button>
        </div>
      </div>
    </div>
  );
}
