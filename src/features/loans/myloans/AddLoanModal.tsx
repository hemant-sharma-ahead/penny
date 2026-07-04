import type { Liability } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { EMI_LOAN_TYPES, getLoanMeta } from '@/core/loans/meta';
import { Modal, Button, TextInput, OptionButton, AmountInput } from '@/components/ui';
import { useLoanForm } from './useLoanForm';

interface AddLoanModalProps {
  saveLiability: (l: Liability) => Promise<unknown>;
  onClose: () => void;
  /** When set, the modal edits this loan instead of adding a new one. */
  loan?: Liability | undefined;
}

export function AddLoanModal({ saveLiability, onClose, loan }: AddLoanModalProps) {
  const form = useLoanForm(saveLiability, onClose, loan);
  const editing = Boolean(loan);

  return (
    <Modal
      onClose={onClose}
      title={editing ? 'Edit Loan' : 'Add Loan'}
      scrollable
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" fullWidth onClick={form.save} disabled={!form.canSave} loading={form.saving}>
            {form.saving ? 'Saving…' : editing ? 'Update Loan' : 'Save Loan'}
          </Button>
        </div>
      }
    >
      {/* Loan type */}
      <div>
        <p className="text-xs font-medium text-secondary mb-1.5">Loan type</p>
        <div className="grid grid-cols-2 gap-2">
          {EMI_LOAN_TYPES.map((t) => {
            const m = getLoanMeta(t);
            return (
              <OptionButton
                key={t}
                label={m.label}
                icon={m.icon}
                selected={form.type === t}
                onClick={() => form.setType(t)}
                color={m.color}
              />
            );
          })}
        </div>
      </div>

      <TextInput
        label="Loan name"
        value={form.name}
        onChange={form.setName}
        placeholder={`e.g. ${getLoanMeta(form.type).label}`}
        autoFocus
      />

      <TextInput
        label="Lender (optional)"
        value={form.lender}
        onChange={form.setLender}
        placeholder="e.g. HDFC Bank, SBI"
      />

      <div className="grid grid-cols-2 gap-3">
        <AmountInput
          label="Outstanding"
          value={form.outstanding}
          onChange={form.setOutstanding}
          placeholder="e.g. 2500000"
        />
        <TextInput
          label="Rate (% p.a.)"
          value={form.rate}
          onChange={form.setRate}
          type="number"
          inputMode="decimal"
          placeholder="e.g. 8.5"
        />
      </div>

      <div>
        <p className="text-xs font-medium text-secondary mb-1">Tenure</p>
        <div className="grid grid-cols-2 gap-3">
          <TextInput
            value={form.tenureYrs}
            onChange={form.setTenureYrs}
            type="number"
            inputMode="numeric"
            placeholder="e.g. 20"
            suffix="yr"
          />
          <TextInput
            value={form.tenureMos}
            onChange={form.setTenureMos}
            type="number"
            inputMode="numeric"
            placeholder="0"
            suffix="mo"
          />
        </div>
      </div>

      {form.computedEmi !== null && (
        <div
          className="flex items-center justify-between px-3 py-2.5 rounded-xl"
          style={{ backgroundColor: 'var(--color-surface-secondary)' }}
        >
          <span className="text-xs font-medium text-secondary">Monthly EMI</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
            {formatCurrency(form.computedEmi)}
          </span>
        </div>
      )}
    </Modal>
  );
}
