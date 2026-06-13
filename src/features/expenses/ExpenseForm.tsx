import { useState } from 'react';
import type { Expense, ExpenseCategory, Hashtag } from '@/core/db/types';

interface Props {
  categories: ExpenseCategory[];
  hashtags: Hashtag[];
  editing: Expense | null;
  onSave: (expense: Expense) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

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

export function ExpenseForm({ categories, hashtags, editing, onSave, onDelete, onClose }: Props) {
  const defaultCategoryId = categories[0]?.id ?? '';

  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? defaultCategoryId);
  const [description, setDescription] = useState(editing?.description ?? '');
  const [date, setDate] = useState(() => (editing ? epochToDateInput(editing.date) : epochToDateInput(Date.now())));
  const [tagInput, setTagInput] = useState(editing ? editing.hashtags.join(' ') : '');
  const [isRecurring, setIsRecurring] = useState(editing?.isRecurring ?? false);
  const [intervalDays, setIntervalDays] = useState(String(editing?.recurringIntervalDays ?? 30));
  const [saving, setSaving] = useState(false);

  const activeTags = parseTags(tagInput);
  const tagParts = tagInput.split(/[\s,]+/);
  const lastWord = (tagParts[tagParts.length - 1] ?? '').replace(/^#/, '');
  const tagSuggestions =
    lastWord.length > 0
      ? hashtags.filter((h) => h.name.startsWith(lastWord) && !activeTags.includes(h.name)).slice(0, 5)
      : [];

  function applyTagSuggestion(name: string) {
    const parts = tagInput.split(/[\s,]+/);
    parts[parts.length - 1] = name;
    setTagInput(parts.join(' ') + ' ');
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
      createdAt: editing?.createdAt ?? now,
      updatedAt: now
    })
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  function handleDelete() {
    if (!editing) return;
    onDelete(editing.id).catch(() => {});
  }

  return (
    <div className="fixed inset-0 z-60 flex items-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-2xl p-5 flex flex-col gap-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">{editing ? 'Edit expense' : 'Add expense'}</h3>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400"
          >
            <i className="ti ti-x" style={{ fontSize: 20 }} aria-hidden="true" />
          </button>
        </div>

        {/* Amount */}
        <div>
          <label className="text-xs font-medium text-slate-500">Amount (₹)</label>
          <input
            type="number"
            inputMode="decimal"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </div>

        {/* Category */}
        <div>
          <label className="text-xs font-medium text-slate-500">Category</label>
          <div className="mt-1 grid grid-cols-4 gap-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryId(cat.id)}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors ${
                  categoryId === cat.id ? 'bg-slate-50' : 'border-transparent bg-slate-50/50'
                }`}
                style={categoryId === cat.id ? { borderColor: cat.color } : {}}
              >
                <i className={`ti ${cat.icon}`} style={{ fontSize: 18, color: cat.color }} aria-hidden="true" />
                <span className="text-[9px] font-medium text-slate-600 text-center leading-tight">
                  {cat.name.split(' ')[0] ?? cat.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-medium text-slate-500">Description</label>
          <input
            type="text"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            placeholder="What was this for?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Date */}
        <div>
          <label className="text-xs font-medium text-slate-500">Date</label>
          <input
            type="date"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {/* Hashtags */}
        <div>
          <label className="text-xs font-medium text-slate-500">Tags (space-separated, e.g. emi travel)</label>
          <input
            type="text"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
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
                  className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5"
                  onClick={() => applyTagSuggestion(s.name)}
                >
                  #{s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recurring toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">Recurring</p>
            <p className="text-xs text-slate-400">Bills, subscriptions, EMIs</p>
          </div>
          <button
            type="button"
            onClick={() => setIsRecurring((v) => !v)}
            className={`w-11 h-6 rounded-full transition-colors ${isRecurring ? 'bg-[#00a86b]' : 'bg-slate-200'}`}
            aria-label="Toggle recurring"
          >
            <span
              className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${
                isRecurring ? 'translate-x-[22px]' : 'translate-x-[2px]'
              }`}
            />
          </button>
        </div>

        {isRecurring && (
          <div>
            <label className="text-xs font-medium text-slate-500">Repeat every (days)</label>
            <input
              type="number"
              inputMode="numeric"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
              value={intervalDays}
              onChange={(e) => setIntervalDays(e.target.value)}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          {editing && (
            <button
              type="button"
              onClick={handleDelete}
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
