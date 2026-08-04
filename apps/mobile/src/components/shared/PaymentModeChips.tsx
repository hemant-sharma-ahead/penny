import { useState } from 'react';
import { View, Pressable, ScrollView, Text } from 'react-native';
import type { PaymentMode, Account } from '@/core/db/types';
import { usePaymentModes } from '~/hooks/usePaymentModes';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { selectionRingStyle } from '~/lib/color';
import { isPaymentModeDisabled } from './paymentModes';
import { PaymentModeFormModal } from './PaymentModeFormModal';

interface PaymentModeChipsProps {
  value: string;
  onChange: (mode: string) => void;
  selectedAccount?: Account | undefined;
  /** A candidate not (yet) persisted as a real `PaymentMode` row — e.g. Bank Statement Import's
   *  `inferPaymentMode()` can pre-fill `value` with a rail (NEFT/IMPS/RTGS/Cheque) that's only
   *  actually created once its import batch commits (`useBankImport.ts`'s `commitAndImport`). Folded
   *  into the displayed chip list (if its id isn't already present) so the pre-filled selection still
   *  shows its real label/icon/color instead of rendering with nothing recognizably selected. */
  pendingCandidate?: Pick<PaymentMode, 'id' | 'label' | 'icon' | 'color'> | undefined;
}

/** Horizontal, scrollable payment-mode selector — the 5 built-in modes plus any custom ones
 *  created so far (e.g. by Bank Statement Import, `core/bank-import/paymentModeInference.ts`).
 *  Disables modes incompatible with the account. */
export function PaymentModeChips({ value, onChange, selectedAccount, pendingCandidate }: PaymentModeChipsProps) {
  const theme = useThemeColors();
  const { modes: allModes, save: savePaymentMode } = usePaymentModes();
  const [showAddForm, setShowAddForm] = useState(false);
  const modes =
    pendingCandidate && !allModes.some((m) => m.id === pendingCandidate.id)
      ? [...allModes, pendingCandidate]
      : allModes;
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {modes.map((m) => {
          const disabled = isPaymentModeDisabled(selectedAccount, m.id);
          const active = value === m.id;
          return (
            <Pressable
              key={m.id}
              disabled={disabled}
              onPress={() => !disabled && onChange(value === m.id ? '' : m.id)}
              className="items-center gap-1 w-[50px]"
              style={{ opacity: disabled ? 0.3 : 1 }}
            >
              <View style={selectionRingStyle(active && !disabled, theme.surface, m.color)}>
                <View
                  className="w-9 h-9 rounded-[10px] items-center justify-center"
                  style={{ backgroundColor: m.color }}
                >
                  <Icon name={m.icon} size={15} color="#fff" />
                </View>
              </View>
              <Text className="text-[8px] font-medium leading-tight text-secondary text-center">{m.label}</Text>
            </Pressable>
          );
        })}
        {/* Manual creation — the custom entity backing this list (`payment_modes`) also gets created
         *  automatically by Bank Statement Import; this is the user-initiated path, same "+"-tile
         *  pattern as `AccountChips.tsx`'s inline "+ Add account". */}
        <Pressable
          onPress={() => setShowAddForm(true)}
          className="items-center gap-1 w-[50px]"
          accessibilityLabel="Add payment mode"
        >
          <View
            className="w-9 h-9 rounded-[10px] items-center justify-center border"
            style={{ borderColor: theme.border, borderStyle: 'dashed' }}
          >
            <Icon name="ti-plus" size={15} color={theme.textTertiary} />
          </View>
          <Text className="text-[8px] font-medium leading-tight text-tertiary text-center">Add</Text>
        </Pressable>
      </ScrollView>

      {showAddForm && (
        <PaymentModeFormModal
          existing={allModes}
          onSave={async (mode) => {
            await savePaymentMode(mode);
            onChange(mode.id);
          }}
          onClose={() => setShowAddForm(false)}
        />
      )}
    </>
  );
}
