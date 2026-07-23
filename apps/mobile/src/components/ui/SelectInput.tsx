import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { FormField } from './FormField';
import { Modal } from './Modal';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: string;
}

/**
 * RN port note: web's SelectInput opens a DOM-positioned dropdown panel (measures the trigger's
 * bounding rect via a portal). RN has no DOM measurement/portal equivalent, so this opens the shared
 * centered `Modal` with the option list instead — consistent with docs/DESIGN_GUIDELINES.md's
 * "centered modals, never bottom sheets" rule (an anchored dropdown would visually behave like neither).
 */
export function SelectInput({
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
  disabled,
  error,
  hint
}: SelectInputProps) {
  const theme = useThemeColors();
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((o) => o.value === value);

  const trigger = (
    <Pressable
      disabled={disabled}
      onPress={() => setOpen(true)}
      className={`bg-surface-2 border w-full rounded-xl px-3 py-2.5 flex-row items-center justify-between ${disabled ? 'opacity-50' : ''}`}
      style={{ borderColor: error ? theme.danger : theme.border }}
    >
      <Text className={`text-sm ${selectedOption ? 'text-primary' : 'text-tertiary'}`} numberOfLines={1}>
        {selectedOption ? selectedOption.label : (placeholder ?? 'Select…')}
      </Text>
      <Icon name="ti-chevron-down" size={14} color={theme.textTertiary} />
    </Pressable>
  );

  const content = (
    <>
      {trigger}
      {open && (
        <Modal onClose={() => setOpen(false)} title={label ?? placeholder ?? 'Select'} scrollable>
          <View>
            {options.length === 0 ? (
              <Text className="text-xs text-tertiary py-2">No options</Text>
            ) : (
              options.map((opt) => {
                const sel = opt.value === value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className="flex-row items-center gap-2 py-2.5"
                  >
                    <Text
                      className="flex-1 text-sm"
                      style={{ color: sel ? theme.primary : theme.textPrimary, fontWeight: sel ? '600' : '400' }}
                    >
                      {opt.label}
                    </Text>
                    {sel && <Icon name="ti-check" size={14} color={theme.primary} />}
                  </Pressable>
                );
              })
            )}
          </View>
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
