import { View, Pressable, ScrollView, Text } from 'react-native';
import type { Account } from '@/core/db/types';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { selectionRingStyle } from '~/lib/color';
import { PAYMENT_MODES, isPaymentModeDisabled } from './paymentModes';

interface PaymentModeChipsProps {
  value: string;
  onChange: (mode: string) => void;
  selectedAccount?: Account | undefined;
}

/** Horizontal, scrollable payment-mode selector. Disables modes incompatible with the account. */
export function PaymentModeChips({ value, onChange, selectedAccount }: PaymentModeChipsProps) {
  const theme = useThemeColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {PAYMENT_MODES.map((m) => {
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
              <View className="w-9 h-9 rounded-[10px] items-center justify-center" style={{ backgroundColor: m.color }}>
                <Icon name={m.icon} size={15} color="#fff" />
              </View>
            </View>
            <Text className="text-[8px] font-medium leading-tight text-secondary text-center">{m.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
