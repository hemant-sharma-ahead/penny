import { View, Text } from 'react-native';
import { TextInput, Toggle, OptionButton, AmountInput, SelectInput } from '~/components/ui';
import { FormModal } from './FormModal';
import { ACCOUNT_TYPES, getAccountMeta } from '@/core/accounts/meta';
import { BANK_PRESET_OPTIONS } from '~/lib/bankPresetLabels';
import type { useAccountForm } from '~/hooks/useAccountForm';

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
  const { form: state, patch, selectType, editing, nameError } = form;

  return (
    <FormModal
      title={editing ? 'Edit account' : 'Add account'}
      size="sm"
      onClose={form.close}
      onSave={form.save}
      saving={saving}
      saveDisabled={!state.name.trim() || !!nameError}
      saveLabel={editing ? 'Save changes' : 'Add account'}
      showCancel
    >
      <View className="flex-row flex-wrap gap-2">
        {ACCOUNT_TYPES.map((type) => {
          const meta = getAccountMeta(type);
          return (
            <View key={type} className="w-[23%]">
              <OptionButton
                compact
                label={meta.label}
                icon={meta.icon}
                color={meta.color}
                selected={state.type === type}
                onPress={() => selectType(type)}
              />
            </View>
          );
        })}
      </View>

      <TextInput
        label="Account name"
        value={state.name}
        onChange={(v) => patch({ name: v })}
        placeholder={NAME_PLACEHOLDERS[state.type]}
        error={nameError}
        autoFocus
      />

      <AmountInput
        label={editing ? 'Opening balance' : 'Current balance'}
        value={state.openingBalance}
        onChange={(v) => patch({ openingBalance: v })}
        placeholder="0"
        hint={
          state.type === 'credit_card'
            ? 'Enter outstanding amount owed (will show as negative balance)'
            : 'Balance before any transactions you record in Penny'
        }
      />

      <View className="flex-row items-center gap-3">
        <Toggle
          value={state.includeInNetWorth}
          onChange={(v) => patch({ includeInNetWorth: v })}
          accessibilityLabel="Include in net worth"
        />
        <Text className="text-sm text-primary">Include in net worth</Text>
      </View>

      {/* Optional — feeds SMS Tracking's account-resolution matching (docs/plans/
       *  sms-transaction-tracking.md §3). Scoped to bank/card accounts only, since a cash/wallet
       *  account has no bank SMS sender to ever match against. Both fields are additive/optional —
       *  every account created before this field existed simply has neither set, no migration needed. */}
      {(state.type === 'bank' || state.type === 'credit_card') && (
        <>
          <SelectInput
            label="Bank (optional)"
            value={state.bankId}
            onChange={(v) => patch({ bankId: v as typeof state.bankId })}
            options={[{ value: '', label: 'Not set' }, ...BANK_PRESET_OPTIONS]}
            hint="Helps SMS Tracking match a bank's transaction SMS to this account"
          />
          <TextInput
            label="Last 4 digits of account number (optional)"
            value={state.last4}
            onChange={(v) => patch({ last4: v.replace(/\D/g, '').slice(0, 4) })}
            placeholder="e.g. 8112"
            keyboardType="number-pad"
            maxLength={4}
            hint="Never the full account number — only used to match incoming SMS to this account"
          />
        </>
      )}
    </FormModal>
  );
}
