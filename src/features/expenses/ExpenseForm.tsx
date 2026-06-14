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

interface PaymentMode {
  id: string;
  label: string;
  icon: string;
  color: string;
}

const PAYMENT_MODES: PaymentMode[] = [
  { id: 'cash', label: 'Cash', icon: 'ti-cash', color: '#22c55e' },
  { id: 'upi', label: 'UPI', icon: 'ti-qrcode', color: '#7c3aed' },
  { id: 'hdfc', label: 'HDFC', icon: 'ti-building-bank', color: '#004c8f' },
  { id: 'sbi', label: 'SBI', icon: 'ti-building-bank', color: '#1e3a8a' },
  { id: 'icici', label: 'ICICI', icon: 'ti-building-bank', color: '#f97316' },
  { id: 'axis', label: 'Axis', icon: 'ti-building-bank', color: '#97144d' }
];

export function ExpenseForm({ categories, hashtags, editing, onSave, onDelete, onClose }: Props) {
  const defaultCategoryId = categories[0]?.id ?? '';

  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? defaultCategoryId);
  const [paymentMode, setPaymentMode] = useState(editing?.paymentMode ?? '');
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
      ...(paymentMode ? { paymentMode } : {}),
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
    <div
      className="fixed inset-0 z-60 flex items-end"
      style={{ paddingBottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full bg-surface rounded-t-2xl p-5 flex flex-col gap-4 max-h-[92vh] overflow-y-auto">
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
            {PAYMENT_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setPaymentMode((prev) => (prev === mode.id ? '' : mode.id))}
                className="flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors w-[58px]"
                style={
                  paymentMode === mode.id
                    ? { borderColor: mode.color, backgroundColor: 'var(--color-surface-secondary)' }
                    : { borderColor: 'transparent', backgroundColor: 'var(--color-surface-secondary)' }
                }
              >
                <i className={`ti ${mode.icon}`} style={{ fontSize: 18, color: mode.color }} aria-hidden="true" />
                <span className="text-[9px] font-medium leading-tight text-secondary">{mode.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="text-xs font-medium text-secondary">Category</label>
          <div className="mt-1 grid grid-cols-4 gap-2">
            {categories.map((cat) => (
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
                <span className="text-[9px] font-medium text-center leading-tight text-secondary">
                  {cat.name.split(' ')[0] ?? cat.name}
                </span>
              </button>
            ))}
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

        {/* Hashtags */}
        <div>
          <label className="text-xs font-medium text-secondary">Tags (space-separated, e.g. emi travel)</label>
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

        {/* Recurring toggle + optional interval */}
        <div className={`grid gap-3 ${isRecurring ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <div>
            <label className="text-xs font-medium text-secondary">Recurring</label>
            <div className="mt-1 flex items-center justify-between rounded-xl border border-theme px-3 py-3">
              <span className="text-xs text-tertiary">Bills, EMIs</span>
              <button
                type="button"
                onClick={() => setIsRecurring((v) => !v)}
                className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 ${isRecurring ? 'bg-[#00a86b]' : ''}`}
                style={isRecurring ? {} : { backgroundColor: 'var(--color-surface-tertiary)' }}
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
