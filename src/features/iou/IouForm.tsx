import { useState } from 'react';
import type { IouDirection, PersonalIou } from '@/core/db/types';

interface Props {
  editing: PersonalIou | null;
  onSave: (iou: PersonalIou) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
  nowMs: number;
}

function epochToDateInput(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function IouForm({ editing, onSave, onDelete, onClose, nowMs }: Props) {
  const [direction, setDirection] = useState<IouDirection>(editing?.direction ?? 'lent');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [date, setDate] = useState(() => epochToDateInput(editing?.date ?? nowMs));
  const [dueDate, setDueDate] = useState(() => (editing?.dueDate != null ? epochToDateInput(editing.dueDate) : ''));
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  function handleSave() {
    const parsed = parseFloat(amount);
    if (!description.trim() || isNaN(parsed) || parsed <= 0) return;
    setSaving(true);
    const iou: PersonalIou = {
      id: editing?.id ?? crypto.randomUUID(),
      direction,
      amount: parsed,
      description: description.trim(),
      date: new Date(date).getTime(),
      isSettled: editing?.isSettled ?? false,
      createdAt: editing?.createdAt ?? nowMs,
      updatedAt: nowMs
    };
    if (dueDate) iou.dueDate = new Date(dueDate).getTime();
    if (notes.trim()) iou.notes = notes.trim();
    if (editing?.settledAt != null) iou.settledAt = editing.settledAt;
    onSave(iou)
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
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">{editing ? 'Edit IOU' : 'Add IOU'}</h3>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400"
          >
            <i className="ti ti-x" style={{ fontSize: 20 }} aria-hidden="true" />
          </button>
        </div>

        {/* Direction */}
        <div className="grid grid-cols-2 gap-2">
          {(['lent', 'borrowed'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-colors"
              style={
                direction === d
                  ? {
                      borderColor: d === 'lent' ? '#10b981' : '#ef4444',
                      backgroundColor: d === 'lent' ? '#f0fdf4' : '#fef2f2'
                    }
                  : { borderColor: '#f1f5f9' }
              }
            >
              <i
                className={`ti ${d === 'lent' ? 'ti-arrow-up' : 'ti-arrow-down'}`}
                style={{ fontSize: 16, color: direction === d ? (d === 'lent' ? '#10b981' : '#ef4444') : '#94a3b8' }}
                aria-hidden="true"
              />
              <span
                className="text-sm font-medium"
                style={{ color: direction === d ? (d === 'lent' ? '#10b981' : '#ef4444') : '#64748b' }}
              >
                {d === 'lent' ? 'I lent' : 'I borrowed'}
              </span>
            </button>
          ))}
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

        {/* Description */}
        <div>
          <label className="text-xs font-medium text-slate-500">Description</label>
          <input
            type="text"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            placeholder="e.g. Lunch split, cab fare, concert tickets"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Date + Due date */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500">Date</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Due date (optional)</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-medium text-slate-500">Notes (optional)</label>
          <input
            type="text"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            placeholder="Any context worth remembering"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
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
            {saving ? 'Saving…' : editing ? 'Update' : direction === 'lent' ? 'I lent this' : 'I borrowed this'}
          </button>
        </div>
      </div>
    </div>
  );
}
