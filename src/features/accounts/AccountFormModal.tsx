import { Modal, Button, TextInput, Toggle, OptionButton } from '@/components/ui';
import { ACCOUNT_TYPES, getAccountMeta } from '@/core/accounts/meta';
import type { useAccountForm } from './useAccountForm';

const NAME_PLACEHOLDERS: Record<string, string> = {
  cash: 'e.g. Wallet, Petty Cash',
  bank: 'e.g. HDFC Savings, SBI Current',
  credit_card: 'e.g. HDFC Regalia, Amex Gold',
  wallet: 'e.g. Paytm, PhonePe'
};

interface AccountFormModalProps {
  form: ReturnType<typeof useAccountForm>;
  saving: boolean;
}

export function AccountFormModal({ form, saving }: AccountFormModalProps) {
  const { form: state, patch, selectType, editing } = form;

  return (
    <Modal
      onClose={form.close}
      title={editing ? 'Edit account' : 'Add account'}
      size="sm"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={form.close}>
            Cancel
          </Button>
          <Button variant="primary" fullWidth onClick={form.save} disabled={!state.name.trim()} loading={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add account'}
          </Button>
        </div>
      }
    >
      {/* Type selector */}
      <div className="grid grid-cols-4 gap-2">
        {ACCOUNT_TYPES.map((type) => {
          const meta = getAccountMeta(type);
          return (
            <OptionButton
              key={type}
              compact
              label={meta.label}
              icon={meta.icon}
              color={meta.color}
              selected={state.type === type}
              onClick={() => selectType(type)}
            />
          );
        })}
      </div>

      <TextInput
        label="Account name"
        value={state.name}
        onChange={(v) => patch({ name: v })}
        placeholder={NAME_PLACEHOLDERS[state.type]}
        autoFocus
      />

      <TextInput
        label={editing ? 'Opening balance' : 'Current balance'}
        value={state.openingBalance}
        onChange={(v) => patch({ openingBalance: v })}
        type="number"
        inputMode="decimal"
        placeholder="0"
        prefix="₹"
        hint={
          state.type === 'credit_card'
            ? 'Enter outstanding amount owed (will show as negative balance)'
            : 'Balance before any transactions you record in Penny'
        }
      />

      {/* Include in net worth */}
      <div className="flex items-center gap-3">
        <Toggle
          value={state.includeInNetWorth}
          onChange={(v) => patch({ includeInNetWorth: v })}
          aria-label="Include in net worth"
        />
        <span className="text-sm text-primary">Include in net worth</span>
      </div>
    </Modal>
  );
}
