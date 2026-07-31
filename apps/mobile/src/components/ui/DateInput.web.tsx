import { FormField } from './FormField';
import { useThemeColors } from '~/theme/useThemeColors';
import { useTheme } from '~/theme/ThemeProvider';

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

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * RN Web variant of `DateInput`. `@react-native-community/datetimepicker` ships no web build at
 * all — its platform-less fallback (`datetimepicker.js`) just renders `null` with a console.warn,
 * so `DateInput.tsx`'s Modal would pop open with nothing inside it on RN Web (confirmed by reading
 * the installed package's source: only `.ios.js`/`.android.js`/`.windows.js` variants exist). This
 * renders a real `<input type="date">` instead — the exact DOM element web-react's own `TextInput`
 * uses for `type="date"` — so behavior (native browser calendar affordance included) matches web
 * exactly rather than approximating it.
 */
export function DateInput({
  label,
  value,
  onChange,
  required,
  disabled,
  error,
  hint,
  minimumDate,
  maximumDate
}: DateInputProps) {
  const theme = useThemeColors();
  const { activePalette } = useTheme();

  const field = (
    <input
      type="date"
      value={value}
      onChange={(e: { target: { value: string } }) => onChange(e.target.value)}
      disabled={disabled}
      required={required}
      min={minimumDate ? toDateKey(minimumDate) : undefined}
      max={maximumDate ? toDateKey(maximumDate) : undefined}
      className={`bg-surface-2 border w-full rounded-xl px-3 py-2.5 text-sm ${disabled ? 'opacity-50' : ''}`}
      style={{
        borderColor: error ? theme.open : theme.border,
        color: theme.textPrimary,
        fontFamily: 'inherit',
        colorScheme: activePalette === 'light' ? 'light' : 'dark'
      }}
    />
  );

  if (!label) return field;

  return (
    <FormField label={label} required={required} hint={hint} error={error}>
      {field}
    </FormField>
  );
}
