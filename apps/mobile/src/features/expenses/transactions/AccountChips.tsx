import { View, Pressable, ScrollView, Text } from 'react-native';
import type { Account } from '@/core/db/types';
import { Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { selectionRingStyle } from '~/lib/color';

interface AccountChipsProps {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  showNone?: boolean;
  disabledId?: string;
  onAddAccount: () => void;
}

/**
 * Horizontal, scrollable account selector used by the expense/income/transfer form. RN port note: web's
 * selection ring is a `boxShadow` double-stop trick (`0 0 0 2px surface, 0 0 0 3.5px ${item.color}`) — a
 * surface-colored gap, then a halo in the item's own color. RN has no boxShadow, so this is reproduced
 * with an outer padded+bordered wrapper (padding = the gap, border = the halo, in the item's own color,
 * not a static theme color) around the unchanged inner tile — same pattern used by
 * `PaymentModeChips`/`CategoryPickerModal`'s tile selection indicators.
 */
export function AccountChips({ accounts, value, onChange, showNone, disabledId, onAddAccount }: AccountChipsProps) {
  const theme = useThemeColors();

  if (accounts.length === 0) {
    return (
      <Button variant="ghost" size="sm" icon="ti-plus" onPress={onAddAccount}>
        Add account to track balance
      </Button>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {showNone && (
        <Pressable onPress={() => onChange('')} className="items-center gap-1 w-[56px]">
          <View style={selectionRingStyle(value === '', theme.surface, '#6b7280')}>
            <View className="w-9 h-9 rounded-[10px] items-center justify-center" style={{ backgroundColor: '#6b7280' }}>
              <Icon name="ti-circle-off" size={15} color="#fff" />
            </View>
          </View>
          <Text className="text-[8px] font-medium leading-tight text-secondary text-center">None</Text>
        </Pressable>
      )}
      {accounts.map((acc) => {
        const isSelected = value === acc.id;
        const isDisabled = acc.id === disabledId;
        return (
          <Pressable
            key={acc.id}
            disabled={isDisabled}
            onPress={() => !isDisabled && onChange(isSelected && showNone ? '' : acc.id)}
            className="items-center gap-1 w-[56px]"
            style={{ opacity: isDisabled ? 0.35 : 1 }}
          >
            <View style={selectionRingStyle(isSelected, theme.surface, acc.color)}>
              <View
                className="w-9 h-9 rounded-[10px] items-center justify-center"
                style={{ backgroundColor: acc.color }}
              >
                <Icon name={acc.icon} size={15} color="#fff" />
              </View>
            </View>
            <Text className="text-[8px] font-medium text-center leading-tight text-secondary w-full" numberOfLines={2}>
              {acc.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
