import { View, Text } from 'react-native';
import { TextInput, Toggle, OptionButton, AmountInput } from '~/components/ui';
import { FormModal } from '~/components/shared';
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
    <FormModal
      title={editing ? 'Edit account' : 'Add account'}
      size="sm"
      onClose={form.close}
      onSave={form.save}
      saving={saving}
      saveDisabled={!state.name.trim()}
      saveLabel={editing ? 'Save changes' : 'Add account'}
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
    </FormModal>
  );
}
