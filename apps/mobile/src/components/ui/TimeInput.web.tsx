import { FormField } from './FormField';
import { useThemeColors } from '~/theme/useThemeColors';
import { useTheme } from '~/theme/ThemeProvider';

interface TimeInputProps {
  label?: string;
  /** `HH:mm` (24-hour), matching `epochToTimeInput`. Empty string means "no time set". */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}

/**
 * RN Web variant of `TimeInput` — same reasoning as `DateInput.web.tsx`:
 * `@react-native-community/datetimepicker` ships no web build, so this renders a real
 * `<input type="time">` instead of the native spinner/dialog.
 */
export function TimeInput({ label, value, onChange, disabled, error }: TimeInputProps) {
  const theme = useThemeColors();
  const { activePalette } = useTheme();

  const field = (
    <input
      type="time"
      value={value}
      onChange={(e: { target: { value: string } }) => onChange(e.target.value)}
      disabled={disabled}
      className={`bg-surface-2 border w-full rounded-xl px-3 py-2.5 text-sm ${disabled ? 'opacity-50' : ''}`}
      style={{
        borderColor: error ? theme.danger : theme.border,
        color: theme.textPrimary,
        fontFamily: 'inherit',
        colorScheme: activePalette === 'light' ? 'light' : 'dark'
      }}
    />
  );

  if (!label) return field;

  return (
    <FormField label={label} error={error}>
      {field}
    </FormField>
  );
}
