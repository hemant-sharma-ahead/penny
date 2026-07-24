import { View, Text } from 'react-native';
import type { Liability } from '@/core/db/types';
import { formatCurrency } from '@/lib/formatters';
import { EMI_LOAN_TYPES, getLoanMeta } from '@/core/loans/meta';
import { Modal, Button, TextInput, OptionButton, AmountInput } from '~/components/ui';
import { useThemeColors } from '~/theme/useThemeColors';
import { useLoanForm } from './useLoanForm';

interface AddLoanModalProps {
  saveLiability: (l: Liability) => Promise<unknown>;
  onClose: () => void;
  /** When set, the modal edits this loan instead of adding a new one. */
  loan?: Liability | undefined;
}

/**
 * RN port note: web's `grid-cols-2` (loan type picker, rate/tenure rows) has no Yoga equivalent — swapped
 * for `flex-row flex-wrap` with `w-[48%]`/`flex-1` children (same swap as Insurance's `PolicyForm`). The
 * computed-EMI banner's `var(--color-surface-secondary)`/`var(--color-primary)` CSS vars become real theme
 * hex via `useThemeColors` (same pattern as `DueDateBadge`).
 */
export function AddLoanModal({ saveLiability, onClose, loan }: AddLoanModalProps) {
  const theme = useThemeColors();
  const form = useLoanForm(saveLiability, onClose, loan);
  const editing = Boolean(loan);

  return (
    <Modal
      onClose={onClose}
      title={editing ? 'Edit Loan' : 'Add Loan'}
      scrollable
      footer={
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button variant="secondary" fullWidth onPress={onClose}>
              Cancel
            </Button>
          </View>
          <View className="flex-1">
            <Button variant="primary" fullWidth onPress={form.save} disabled={!form.canSave} loading={form.saving}>
              {form.saving ? 'Saving…' : editing ? 'Update Loan' : 'Save Loan'}
            </Button>
          </View>
        </View>
      }
    >
      <View>
        <Text className="text-xs font-medium text-secondary mb-1.5">Loan type</Text>
        <View className="flex-row flex-wrap gap-2">
          {EMI_LOAN_TYPES.map((t) => {
            const m = getLoanMeta(t);
            return (
              <View key={t} className="w-[48%]">
                <OptionButton
                  label={m.label}
                  icon={m.icon}
                  selected={form.type === t}
                  onPress={() => form.setType(t)}
                  color={m.color}
                />
              </View>
            );
          })}
        </View>
      </View>

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

      <View className="flex-row gap-3">
        <View className="flex-1">
          <AmountInput
            label="Outstanding"
            value={form.outstanding}
            onChange={form.setOutstanding}
            placeholder="e.g. 2500000"
          />
        </View>
        <View className="flex-1">
          <TextInput
            label="Rate (% p.a.)"
            value={form.rate}
            onChange={form.setRate}
            keyboardType="decimal-pad"
            placeholder="e.g. 8.5"
          />
        </View>
      </View>

      <View>
        <Text className="text-xs font-medium text-secondary mb-1">Tenure</Text>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextInput
              value={form.tenureYrs}
              onChange={form.setTenureYrs}
              keyboardType="number-pad"
              placeholder="e.g. 20"
              suffix="yr"
            />
          </View>
          <View className="flex-1">
            <TextInput
              value={form.tenureMos}
              onChange={form.setTenureMos}
              keyboardType="number-pad"
              placeholder="0"
              suffix="mo"
            />
          </View>
        </View>
      </View>

      {form.computedEmi !== null && (
        <View
          className="flex-row items-center justify-between px-3 py-2.5 rounded-xl"
          style={{ backgroundColor: theme.surfaceSecondary }}
        >
          <Text className="text-xs font-medium text-secondary">Monthly EMI</Text>
          <Text className="text-sm font-semibold" style={{ color: theme.primary }}>
            {formatCurrency(form.computedEmi)}
          </Text>
        </View>
      )}
    </Modal>
  );
}
