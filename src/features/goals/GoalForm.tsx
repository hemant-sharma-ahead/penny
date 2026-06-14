import { useState } from 'react';
import type { Goal, GoalRisk } from '@/core/db/types';

interface Props {
  editing: Goal | null;
  onSave: (goal: Goal) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

function epochToDateInput(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const RISK_OPTIONS: { value: GoalRisk; label: string; color: string }[] = [
  { value: 'conservative', label: 'Conservative', color: '#3b82f6' },
  { value: 'moderate', label: 'Moderate', color: '#10b981' },
  { value: 'aggressive', label: 'Aggressive', color: '#ef4444' }
];

const inputStyle = {
  backgroundColor: 'var(--color-surface-secondary)',
  color: 'var(--color-text-primary)',
  borderColor: 'var(--color-border)'
};

const labelStyle = { color: 'var(--color-text-secondary)' };

export function GoalForm({ editing, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(editing?.name ?? '');
  const [targetAmount, setTargetAmount] = useState(editing ? String(editing.targetAmount) : '');
  const [currentAmount, setCurrentAmount] = useState(editing ? String(editing.currentAmount) : '0');
  const [targetDate, setTargetDate] = useState(() => {
    if (editing) return epochToDateInput(editing.targetDate);
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return epochToDateInput(d.getTime());
  });
  const [risk, setRisk] = useState<GoalRisk>(editing?.risk ?? 'moderate');
  const [saving, setSaving] = useState(false);

  function handleSave() {
    const target = parseFloat(targetAmount);
    const current = parseFloat(currentAmount) || 0;
    if (!name.trim() || isNaN(target) || target <= 0) return;
    setSaving(true);
    const now = Date.now();
    onSave({
      id: editing?.id ?? crypto.randomUUID(),
      name: name.trim(),
      targetAmount: target,
      currentAmount: current,
      targetDate: new Date(targetDate).getTime(),
      risk,
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
      <div
        className="relative w-full rounded-t-2xl p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {editing ? 'Edit goal' : 'New goal'}
          </h3>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <i className="ti ti-x" style={{ fontSize: 20 }} aria-hidden="true" />
          </button>
        </div>

        {/* Name */}
        <div>
          <label className="text-xs font-medium" style={labelStyle}>
            Goal name
          </label>
          <input
            type="text"
            className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            style={inputStyle}
            placeholder="e.g. Emergency fund, Europe trip"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        {/* Target amount */}
        <div>
          <label className="text-xs font-medium" style={labelStyle}>
            Target amount (₹)
          </label>
          <input
            type="number"
            inputMode="decimal"
            className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            style={inputStyle}
            placeholder="e.g. 500000"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
          />
        </div>

        {/* Already saved */}
        <div>
          <label className="text-xs font-medium" style={labelStyle}>
            Already saved (₹)
          </label>
          <input
            type="number"
            inputMode="decimal"
            className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            style={inputStyle}
            placeholder="0"
            value={currentAmount}
            onChange={(e) => setCurrentAmount(e.target.value)}
          />
        </div>

        {/* Target date */}
        <div>
          <label className="text-xs font-medium" style={labelStyle}>
            Target date
          </label>
          <input
            type="date"
            className="mt-1 w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            style={inputStyle}
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </div>

        {/* Risk / investment approach */}
        <div>
          <label className="text-xs font-medium" style={labelStyle}>
            Investment approach
          </label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {RISK_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRisk(opt.value)}
                className="py-2.5 rounded-xl text-xs font-medium border-2 transition-colors"
                style={
                  risk === opt.value
                    ? { borderColor: opt.color, color: opt.color, backgroundColor: `${opt.color}10` }
                    : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
            Conservative 7% · Moderate 11% · Aggressive 14% p.a.
          </p>
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
            {saving ? 'Saving…' : editing ? 'Update' : 'Save goal'}
          </button>
        </div>
      </div>
    </div>
  );
}
