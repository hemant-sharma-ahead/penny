import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Modal } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

const MONTH_LABELS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface MonthPickerModalProps {
  value: string;
  onSelect: (m: string) => void;
  onClose: () => void;
  maxMonth?: string | undefined;
}

export function MonthPickerModal({ value, onSelect, onClose, maxMonth }: MonthPickerModalProps) {
  const theme = useThemeColors();
  const [year, setYear] = useState(() => parseInt(value.split('-')[0] ?? String(new Date().getFullYear()), 10));
  const maxYear = maxMonth
    ? parseInt(maxMonth.split('-')[0] ?? String(new Date().getFullYear()), 10)
    : new Date().getFullYear();

  return (
    <Modal onClose={onClose} title="Select Month" size="sm">
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => setYear((y) => y - 1)}
          className="w-9 h-9 items-center justify-center rounded-lg"
          accessibilityLabel="Previous year"
        >
          <Icon name="ti-chevron-left" size={18} color={theme.textSecondary} />
        </Pressable>
        <Text className="text-base font-semibold text-primary">{year}</Text>
        <Pressable
          onPress={() => setYear((y) => y + 1)}
          disabled={year >= maxYear}
          className="w-9 h-9 items-center justify-center rounded-lg"
          style={{ opacity: year >= maxYear ? 0.3 : 1 }}
          accessibilityLabel="Next year"
        >
          <Icon name="ti-chevron-right" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {MONTH_LABELS_SHORT.map((label, idx) => {
          const m = `${year}-${String(idx + 1).padStart(2, '0')}`;
          const isSelected = m === value;
          const isDisabled = maxMonth ? m > maxMonth : false;
          return (
            <Pressable
              key={m}
              onPress={() => {
                onSelect(m);
                onClose();
              }}
              disabled={isDisabled}
              className="py-2.5 rounded-xl items-center"
              style={{
                width: '22%',
                opacity: isDisabled ? 0.3 : 1,
                backgroundColor: isSelected ? theme.primary : theme.surfaceSecondary
              }}
            >
              <Text className="text-sm font-medium" style={{ color: isSelected ? '#fff' : theme.textSecondary }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}
