import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { TextInput, Toggle, OptionButton, AmountInput, ConfirmDialog } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { FormModal } from './FormModal';
import { BankPickerModal, type BankPickerOption } from './BankPickerModal';
import { ACCOUNT_TYPES, getAccountMeta } from '@/core/accounts/meta';
import { BANK_PRESET_OPTIONS, BANK_PRESET_LABELS } from '~/lib/bankPresetLabels';
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

const BANK_PICKER_OPTIONS: BankPickerOption[] = [
  { value: '', label: 'Not set', pinLast: true },
  ...BANK_PRESET_OPTIONS.map((o) => ({ value: o.value, label: o.label, bankId: o.value }))
];

export function AccountFormModal({ form, saving }: AccountFormModalProps) {
  const { form: state, patch, selectType, setIsDefault, setIsClosed, editing, nameError } = form;
  const theme = useThemeColors();
  const [showBankPicker, setShowBankPicker] = useState(false);
  const selectedBankLabel = state.bankId ? BANK_PRESET_LABELS[state.bankId] : 'Not set';
  // Default/Closed only make sense for an account type that can actually be "closed" in the real
  // world or meaningfully "defaulted" on a transaction — Cash already IS the implicit fallback when
  // no default is set, so it's excluded rather than showing a toggle that would always be redundant.
  const showDefaultClosedToggles = state.type !== 'cash';

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

      {/* Default account + Closed (2026-08-27) — Bank/Credit Card/Wallet only, mutually exclusive on
       *  THIS account (`setIsDefault`/`setIsClosed` each clear the other); the cross-account default
       *  swap (a DIFFERENT account currently holding it) is confirmed via the popup below instead,
       *  since that affects an account you're not even looking at right now. */}
      {showDefaultClosedToggles && (
        <>
          <View className="gap-0.5">
            <View className="flex-row items-center gap-3">
              <Toggle value={state.isDefault} onChange={setIsDefault} accessibilityLabel="Set as default account" />
              <Text className="text-sm text-primary">Set as default account</Text>
            </View>
            <Text className="text-[10.5px] text-tertiary ml-[46px]">
              Pre-fills this account (and its payment mode) on every new transaction
            </Text>
          </View>
          <View className="gap-0.5">
            <View className="flex-row items-center gap-3">
              <Toggle value={state.isClosed} onChange={setIsClosed} accessibilityLabel="Closed" />
              <Text className="text-sm text-primary">Closed</Text>
            </View>
            <Text className="text-[10.5px] text-tertiary ml-[46px]">
              No longer operational — hidden from every account picker, kept for history
            </Text>
          </View>
        </>
      )}

      {/* Optional — feeds SMS Tracking's account-resolution matching (docs/plans/
       *  sms-transaction-tracking.md §3). Scoped to bank/card accounts only, since a cash/wallet
       *  account has no bank SMS sender to ever match against. Both fields are additive/optional —
       *  every account created before this field existed simply has neither set, no migration needed. */}
      {(state.type === 'bank' || state.type === 'credit_card') && (
        <>
          <View className="gap-1">
            <Text className="text-xs font-medium text-secondary">Bank (optional)</Text>
            <Pressable
              onPress={() => setShowBankPicker(true)}
              className="flex-row items-center justify-between rounded-xl border px-3 py-2.5"
              style={{ borderColor: theme.border }}
            >
              <Text className="text-sm text-primary">{selectedBankLabel}</Text>
              <Icon name="ti-chevron-down" size={14} color={theme.textTertiary} />
            </Pressable>
            <Text className="text-[10.5px] text-tertiary">
              Helps SMS Tracking match a bank's transaction SMS to this account
            </Text>
          </View>
          {showBankPicker && (
            <BankPickerModal
              options={BANK_PICKER_OPTIONS}
              value={state.bankId ?? ''}
              onSelect={(v) => patch({ bankId: v as typeof state.bankId })}
              onClose={() => setShowBankPicker(false)}
            />
          )}
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

      {/* Cross-account default swap (2026-08-27) — `save()` holds off writing anything until this is
       *  confirmed; Cancel just closes the popup, leaving the form exactly as it was (nothing saved). */}
      <ConfirmDialog
        isOpen={!!form.pendingDefaultSwap}
        onClose={form.cancelDefaultSwap}
        onConfirm={() => void form.confirmDefaultSwap()}
        title="Change default account?"
        message={
          form.pendingDefaultSwap
            ? `"${form.pendingDefaultSwap.name}" is currently your default account. Making "${state.name.trim() || 'this account'}" the default will remove it from "${form.pendingDefaultSwap.name}" — only one account can be default at a time.`
            : ''
        }
        confirmLabel="Yes, make this default"
        confirmVariant="primary"
      />
    </FormModal>
  );
}
