import { useState } from 'react';
import { Platform, Pressable, View, Text } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { formatDate } from '@/lib/date';
import { FormField } from './FormField';
import { Modal } from './Modal';
import { Button } from './Button';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

interface DateInputProps {
  label?: string;
  /** `YYYY-MM-DD`, matching every existing call site's value format (`epochToDateInput`/`toDateKey`).
   *  Empty string means "no date set". */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: string;
  minimumDate?: Date;
  maximumDate?: Date;
}

function parseDateKey(value: string): Date {
  if (!value) return new Date();
  const d = new Date(`${value}T00:00:00`);
  return isNaN(d.getTime()) ? new Date() : d;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * RN equivalent of web's `<input type="date">` — the platform native date picker, since RN has no HTML
 * form-control equivalent (found missing entirely via the 2026-07-25 parity sweep: DOB, policy renewal,
 * IOU due dates, subscription "last charged", and goal target dates were all raw `YYYY-MM-DD` text
 * fields with no calendar affordance). Android opens the native `DateTimePickerAndroid` dialog directly
 * (no modal needed — it's already a native dialog); iOS's `DateTimePicker` has no dialog chrome of its
 * own, so it's shown inside the shared centered `Modal`, per docs/DESIGN_GUIDELINES.md's "centered
 * modals, never bottom sheets" rule — same reasoning as `SelectInput`'s own port note.
 */
export function DateInput({
  label,
  value,
  onChange,
  placeholder = 'Select a date',
  required,
  disabled,
  error,
  hint,
  minimumDate,
  maximumDate
}: DateInputProps) {
  const theme = useThemeColors();
  const [iosPickerOpen, setIosPickerOpen] = useState(false);
  const [iosDraft, setIosDraft] = useState<Date>(() => parseDateKey(value));

  const openPicker = () => {
    if (disabled) return;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: parseDateKey(value),
        mode: 'date',
        minimumDate,
        maximumDate,
        onChange: (event, selected) => {
          if (event.type === 'set' && selected) onChange(toDateKey(selected));
        }
      });
    } else {
      setIosDraft(parseDateKey(value));
      setIosPickerOpen(true);
    }
  };

  const field = (
    <Pressable
      disabled={disabled}
      onPress={openPicker}
      className={`bg-surface-2 border w-full rounded-xl px-3 py-2.5 flex-row items-center justify-between ${disabled ? 'opacity-50' : ''}`}
      style={{ borderColor: error ? theme.open : theme.border }}
    >
      <Text className={`text-sm ${value ? 'text-primary' : 'text-tertiary'}`} numberOfLines={1}>
        {value ? formatDate(parseDateKey(value).getTime()) : placeholder}
      </Text>
      <Icon name="ti-calendar" size={16} color={theme.textTertiary} />
    </Pressable>
  );

  const content = (
    <>
      {field}
      {iosPickerOpen && (
        <Modal onClose={() => setIosPickerOpen(false)} title={label ?? 'Select a date'} size="sm">
          <View className="items-center">
            <DateTimePicker
              value={iosDraft}
              mode="date"
              display="spinner"
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              onChange={(_, selected) => selected && setIosDraft(selected)}
            />
          </View>
          <Button
            fullWidth
            className="mt-3"
            onPress={() => {
              onChange(toDateKey(iosDraft));
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
    <FormField label={label} required={required} hint={hint} error={error}>
      {content}
    </FormField>
  );
}
