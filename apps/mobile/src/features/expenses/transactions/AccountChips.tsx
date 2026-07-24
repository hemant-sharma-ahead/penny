import { View, Text, Pressable, ScrollView } from 'react-native';
import type { Account } from '@/core/db/types';
import { Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

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
 * selection ring uses a `boxShadow` double-stop trick (surface gap + account-color ring) — RN has no
 * boxShadow, so selection is shown with a plain inner border against the tile's own background, same
 * pattern as CategoryPickerModal's tile selection indicator.
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
          <View
            className="w-9 h-9 rounded-[10px] items-center justify-center"
            style={{ backgroundColor: '#6b7280', borderWidth: value === '' ? 2 : 0, borderColor: theme.surface }}
          >
            <Icon name="ti-circle-off" size={15} color="#fff" />
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
            <View
              className="w-9 h-9 rounded-[10px] items-center justify-center"
              style={{ backgroundColor: acc.color, borderWidth: isSelected ? 2 : 0, borderColor: theme.surface }}
            >
              <Icon name={acc.icon} size={15} color="#fff" />
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
