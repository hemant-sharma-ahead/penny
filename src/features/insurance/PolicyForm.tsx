import { useState } from 'react';
import type { InsurancePolicy, InsuranceType } from '@/core/db/types';

interface Props {
  editing: InsurancePolicy | null;
  onSave: (policy: InsurancePolicy) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

function epochToDateInput(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const POLICY_TYPES: { value: InsuranceType; label: string; icon: string; color: string }[] = [
  { value: 'term', label: 'Term', icon: 'ti-umbrella', color: '#ef4444' },
  { value: 'health', label: 'Health', icon: 'ti-heart-rate-monitor', color: '#10b981' },
  { value: 'vehicle', label: 'Vehicle', icon: 'ti-car', color: '#f59e0b' },
  { value: 'home', label: 'Home', icon: 'ti-home', color: '#6366f1' },
  { value: 'travel', label: 'Travel', icon: 'ti-plane', color: '#0ea5e9' },
  { value: 'life', label: 'Life / ULIP', icon: 'ti-heart', color: '#8b5cf6' },
  { value: 'other', label: 'Other', icon: 'ti-shield', color: '#6b7280' }
];

export function PolicyForm({ editing, onSave, onDelete, onClose }: Props) {
  const [type, setType] = useState<InsuranceType>(editing?.type ?? 'term');
  const [insurer, setInsurer] = useState(editing?.insurer ?? '');
  const [policyNumber, setPolicyNumber] = useState(editing?.policyNumber ?? '');
  const [coverageAmount, setCoverageAmount] = useState(editing ? String(editing.coverageAmount) : '');
  const [annualPremium, setAnnualPremium] = useState(editing ? String(editing.annualPremium) : '');
  const [renewalDate, setRenewalDate] = useState(() => {
    if (editing) return epochToDateInput(editing.renewalDate);
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return epochToDateInput(d.getTime());
  });
  const [nominees, setNominees] = useState(editing?.nominees ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  function handleSave() {
    const coverage = parseFloat(coverageAmount);
    const premium = parseFloat(annualPremium);
    if (!insurer.trim() || isNaN(coverage) || coverage <= 0 || isNaN(premium) || premium <= 0) return;
    setSaving(true);
    const now = Date.now();
    const pn = policyNumber.trim();
    const nom = nominees.trim();
    const notesVal = notes.trim();
    onSave({
      id: editing?.id ?? crypto.randomUUID(),
      type,
      insurer: insurer.trim(),
      ...(pn ? { policyNumber: pn } : {}),
      coverageAmount: coverage,
      annualPremium: premium,
      renewalDate: new Date(renewalDate).getTime(),
      ...(nom ? { nominees: nom } : {}),
      ...(notesVal ? { notes: notesVal } : {}),
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
    <div className="fixed inset-0 z-20 flex items-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-2xl p-5 flex flex-col gap-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">{editing ? 'Edit policy' : 'Add policy'}</h3>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400"
          >
            <i className="ti ti-x" style={{ fontSize: 20 }} aria-hidden="true" />
          </button>
        </div>

        {/* Policy type */}
        <div>
          <label className="text-xs font-medium text-slate-500">Policy type</label>
          <div className="mt-1 grid grid-cols-4 gap-2">
            {POLICY_TYPES.map((pt) => (
              <button
                key={pt.value}
                type="button"
                onClick={() => setType(pt.value)}
                className="flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors"
                style={
                  type === pt.value
                    ? { borderColor: pt.color, backgroundColor: `${pt.color}10` }
                    : { borderColor: '#f1f5f9' }
                }
              >
                <i
                  className={`ti ${pt.icon}`}
                  style={{ fontSize: 18, color: type === pt.value ? pt.color : '#94a3b8' }}
                  aria-hidden="true"
                />
                <span
                  className="text-[9px] font-medium text-center leading-tight"
                  style={{ color: type === pt.value ? pt.color : '#64748b' }}
                >
                  {pt.label.split(' ')[0] ?? pt.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Insurer */}
        <div>
          <label className="text-xs font-medium text-slate-500">Insurer / Company</label>
          <input
            type="text"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            placeholder="e.g. LIC, HDFC ERGO, Star Health"
            value={insurer}
            onChange={(e) => setInsurer(e.target.value)}
            autoFocus
          />
        </div>

        {/* Policy number */}
        <div>
          <label className="text-xs font-medium text-slate-500">Policy number (optional)</label>
          <input
            type="text"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            placeholder="e.g. P-12345678"
            value={policyNumber}
            onChange={(e) => setPolicyNumber(e.target.value)}
          />
        </div>

        {/* Coverage + Premium */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500">Coverage amount (₹)</label>
            <input
              type="number"
              inputMode="decimal"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
              placeholder="e.g. 10000000"
              value={coverageAmount}
              onChange={(e) => setCoverageAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Annual premium (₹)</label>
            <input
              type="number"
              inputMode="decimal"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
              placeholder="e.g. 12000"
              value={annualPremium}
              onChange={(e) => setAnnualPremium(e.target.value)}
            />
          </div>
        </div>

        {/* Renewal date */}
        <div>
          <label className="text-xs font-medium text-slate-500">Renewal / expiry date</label>
          <input
            type="date"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            value={renewalDate}
            onChange={(e) => setRenewalDate(e.target.value)}
          />
        </div>

        {/* Nominees */}
        <div>
          <label className="text-xs font-medium text-slate-500">Nominees (optional)</label>
          <input
            type="text"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            placeholder="e.g. Spouse, Child"
            value={nominees}
            onChange={(e) => setNominees(e.target.value)}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-medium text-slate-500">Notes (optional)</label>
          <input
            type="text"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a86b]"
            placeholder="e.g. Family floater, includes dental"
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
            {saving ? 'Saving…' : editing ? 'Update' : 'Add policy'}
          </button>
        </div>
      </div>
    </div>
  );
}
