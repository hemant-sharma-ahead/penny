import { useState } from 'react';
import { Platform, Pressable, View, Text } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { formatTime } from '@/lib/date';
import { FormField } from './FormField';
import { Modal } from './Modal';
import { Button } from './Button';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

interface TimeInputProps {
  label?: string;
  /** `HH:mm` (24-hour), matching `epochToTimeInput`. Empty string means "no time set". */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}

function parseTimeKey(value: string): Date {
  const d = new Date();
  if (!value) return d;
  const [h, m] = value.split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function toTimeKey(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * RN equivalent of web's `<input type="time">` — pairs with `DateInput` as an equal-width sibling
 * (see `ExpenseForm.tsx`). Same iOS-modal / Android-native-dialog split as `DateInput`, since
 * `@react-native-community/datetimepicker` has no dialog chrome of its own on iOS.
 */
export function TimeInput({ label, value, onChange, placeholder = 'Select a time', disabled, error }: TimeInputProps) {
  const theme = useThemeColors();
  const [iosPickerOpen, setIosPickerOpen] = useState(false);
  const [iosDraft, setIosDraft] = useState<Date>(() => parseTimeKey(value));

  const openPicker = () => {
    if (disabled) return;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: parseTimeKey(value),
        mode: 'time',
        is24Hour: false,
        onChange: (event, selected) => {
          if (event.type === 'set' && selected) onChange(toTimeKey(selected));
        }
      });
    } else {
      setIosDraft(parseTimeKey(value));
      setIosPickerOpen(true);
    }
  };

  const field = (
    <Pressable
      disabled={disabled}
      onPress={openPicker}
      className={`bg-surface-2 border w-full rounded-xl px-3 py-2.5 flex-row items-center justify-between ${disabled ? 'opacity-50' : ''}`}
      style={{ borderColor: error ? theme.danger : theme.border }}
    >
      <Text className={`text-sm ${value ? 'text-primary' : 'text-tertiary'}`} numberOfLines={1}>
        {value ? formatTime(parseTimeKey(value).getTime()) : placeholder}
      </Text>
      <Icon name="ti-clock" size={16} color={theme.textTertiary} />
    </Pressable>
  );

  const content = (
    <>
      {field}
      {iosPickerOpen && (
        <Modal onClose={() => setIosPickerOpen(false)} title={label ?? 'Select a time'} size="sm">
          <View className="items-center">
            <DateTimePicker
              value={iosDraft}
              mode="time"
              display="spinner"
              onChange={(_, selected) => selected && setIosDraft(selected)}
            />
          </View>
          <Button
            fullWidth
            className="mt-3"
            onPress={() => {
              onChange(toTimeKey(iosDraft));
              setIosPickerOpen(false);
            }}
          >
            Done
          </Button>
        </Modal>
      )}
    </>
  );

  if (!label) return content;

  return (
    <FormField label={label} error={error}>
      {content}
    </FormField>
  );
}
