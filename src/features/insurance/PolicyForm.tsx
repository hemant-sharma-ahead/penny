import { useState } from 'react';
import type { InsurancePolicy, InsuranceType } from '@/core/db/types';
import { epochToDateInput } from '@/lib/formatters';
import { TextInput, OptionButton } from '@/components/ui';
import { FormModal } from '@/components/shared';

interface Props {
  editing: InsurancePolicy | null;
  onSave: (policy: InsurancePolicy) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
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
    <FormModal
      title={editing ? 'Edit policy' : 'Add policy'}
      onClose={onClose}
      onSave={handleSave}
      onDelete={editing ? handleDelete : undefined}
      saving={saving}
      saveLabel={editing ? 'Update' : 'Add policy'}
    >
      {/* Policy type */}
      <div>
        <label className="text-xs font-medium text-secondary">Policy type</label>
        <div className="mt-1 grid grid-cols-4 gap-2">
          {POLICY_TYPES.map((pt) => (
            <OptionButton
              key={pt.value}
              compact
              label={pt.label.split(' ')[0] ?? pt.label}
              icon={pt.icon}
              color={pt.color}
              selected={type === pt.value}
              onClick={() => setType(pt.value)}
            />
          ))}
        </div>
      </div>

      <TextInput
        label="Insurer / Company"
        value={insurer}
        onChange={setInsurer}
        placeholder="e.g. LIC, HDFC ERGO, Star Health"
        autoFocus
      />

      <TextInput
        label="Policy number (optional)"
        value={policyNumber}
        onChange={setPolicyNumber}
        placeholder="e.g. P-12345678"
      />

      <div className="grid grid-cols-2 gap-3">
        <TextInput
          label="Coverage amount (₹)"
          value={coverageAmount}
          onChange={setCoverageAmount}
          type="number"
          inputMode="decimal"
          placeholder="e.g. 10000000"
        />
        <TextInput
          label="Annual premium (₹)"
          value={annualPremium}
          onChange={setAnnualPremium}
          type="number"
          inputMode="decimal"
          placeholder="e.g. 12000"
        />
      </div>

      <TextInput label="Renewal / expiry date" value={renewalDate} onChange={setRenewalDate} type="date" />

      <TextInput label="Nominees (optional)" value={nominees} onChange={setNominees} placeholder="e.g. Spouse, Child" />

      <TextInput
        label="Notes (optional)"
        value={notes}
        onChange={setNotes}
        placeholder="e.g. Family floater, includes dental"
      />
    </FormModal>
  );
}
