import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Modal } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

export interface FilterDropdownOption {
  value: string;
  label: string;
  /** Optional trailing count (e.g. how many headlines mention this stock). */
  count?: number;
}

interface FilterDropdownProps {
  label: string;
  value: string;
  options: FilterDropdownOption[];
  onChange: (value: string) => void;
}

/**
 * RN port of apps/web-legacy/src/features/news/FilterDropdown.tsx. Compact "in-field label" filter
 * (source/tone/holding) — web opens a DOM-positioned dropdown panel with a full-screen click-catcher;
 * RN has no DOM measurement/portal equivalent, so this opens the shared centered `Modal` instead, same
 * fix as `SelectInput`/`ContextSwitcher`/every other hand-rolled-dropdown case in this migration.
 */
export function FilterDropdown({ label, value, options, onChange }: FilterDropdownProps) {
  const theme = useThemeColors();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="flex-1 rounded-xl border px-2.5 py-1.5"
        style={{ borderColor: open ? theme.primary : theme.border }}
      >
        <Text className="text-[9px] font-semibold uppercase tracking-wide text-tertiary">{label}</Text>
        <View className="flex-row items-center justify-between gap-1 mt-0.5">
          <Text
            className="text-xs font-semibold"
            style={{ color: open ? theme.primary : theme.textPrimary }}
            numberOfLines={1}
          >
            {selected?.label ?? '—'}
          </Text>
          <Icon name="ti-chevron-down" size={12} color={open ? theme.primary : theme.textTertiary} />
        </View>
      </Pressable>

      {open && (
        <Modal onClose={() => setOpen(false)} title={label} scrollable>
          <View>
            {options.map((opt) => {
              const sel = opt.value === value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className="flex-row items-center justify-between gap-2 px-4 py-3"
                  style={sel ? { backgroundColor: theme.surfaceSecondary } : undefined}
                >
                  <Text className="text-sm font-medium text-primary flex-1" numberOfLines={1}>
                    {opt.label}
                  </Text>
                  {sel ? (
                    <Icon name="ti-check" size={15} color={theme.primary} />
                  ) : opt.count !== undefined ? (
                    <Text className="text-xs text-tertiary">{opt.count}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </Modal>
      )}
    </>
  );
}
