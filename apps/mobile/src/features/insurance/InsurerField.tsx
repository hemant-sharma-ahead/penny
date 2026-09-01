import { useMemo, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Modal, TextInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { InsurerCategory, InsurerMemory } from '@/core/db/types';
import { insurersForCategory } from '@/core/insurance/insurers';
import { insurerSuggestionsForCategory } from '@/core/insurance/insurerMemory';

interface InsurerFieldProps {
  category: InsurerCategory;
  categoryLabel: string; // e.g. "life insurers", "health insurers", "general insurers"
  value: string;
  onChange: (name: string) => void;
  insurerMemories: InsurerMemory[];
}

/**
 * Insurer / Company picker (insurance-redesign-v4.html §⑤) — a centered-Modal radio list scoped to the
 * policy type's insurer category, plus an "Other" row revealing a free-text field with locally
 * remembered suggestions as tappable chips. RN port note: the mockup's live-filtering typeahead
 * dropdown is simplified here to suggestion chips + a plain text field (no bolded inline substring
 * match) — same underlying `insurerSuggestionsForCategory`/local-memory data, a lighter-weight visual
 * treatment given this is a secondary "not in the list" path, not the primary flow.
 */
export function InsurerField({ category, categoryLabel, value, onChange, insurerMemories }: InsurerFieldProps) {
  const theme = useThemeColors();
  const list = useMemo(() => insurersForCategory(category), [category]);
  const [otherMode, setOtherMode] = useState(() => value !== '' && !list.includes(value));
  const [pickerOpen, setPickerOpen] = useState(false);

  const suggestions = useMemo(
    () => insurerSuggestionsForCategory(insurerMemories, category),
    [insurerMemories, category]
  );

  function selectFromList(name: string) {
    setOtherMode(false);
    onChange(name);
    setPickerOpen(false);
  }

  function selectOther() {
    setOtherMode(true);
    onChange('');
    setPickerOpen(false);
  }

  return (
    <View>
      <Text className="text-xs font-medium text-secondary mb-1">Insurer / Company</Text>
      <Pressable
        onPress={() => setPickerOpen(true)}
        className="bg-surface-2 border border-theme w-full rounded-xl px-3 py-2.5 flex-row items-center justify-between"
      >
        <Text className={`text-sm ${otherMode || value ? 'text-primary' : 'text-tertiary'}`} numberOfLines={1}>
          {otherMode ? 'Other' : value || 'Select insurer…'}
        </Text>
        <Icon name="ti-chevron-down" size={14} color={theme.textTertiary} />
      </Pressable>
      <Text className="text-[9px] text-tertiary mt-1">
        {otherMode ? 'Not in the list — remembered locally for next time' : `Showing ${list.length} ${categoryLabel}`}
      </Text>

      {otherMode && (
        <View className="mt-2 gap-2">
          {suggestions.length > 0 && (
            <View>
              <Text className="text-[9px] font-bold uppercase tracking-wide text-tertiary mb-1">
                Used before — tap to reuse
              </Text>
              <View className="flex-row flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => onChange(s.name)}
                    className="px-2.5 py-1.5 rounded-lg border border-theme bg-surface-2"
                  >
                    <Text className="text-[10px] font-semibold text-secondary">{s.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          <TextInput value={value} onChange={onChange} placeholder="Type the insurer's name" autoCapitalize="words" />
          <Pressable onPress={() => setPickerOpen(true)}>
            <Text className="text-[9px] font-semibold" style={{ color: theme.primary }}>
              Pick from list instead
            </Text>
          </Pressable>
        </View>
      )}

      {pickerOpen && (
        <Modal onClose={() => setPickerOpen(false)} title="Insurer / Company" scrollable>
          <View>
            {list.map((name) => {
              const sel = !otherMode && value === name;
              return (
                <Pressable
                  key={name}
                  onPress={() => selectFromList(name)}
                  className="flex-row items-center gap-2 py-2.5 border-b border-theme"
                >
                  <Text
                    className="flex-1 text-sm"
                    style={{ color: sel ? theme.primary : theme.textPrimary, fontWeight: sel ? '600' : '400' }}
                  >
                    {name}
                  </Text>
                  {sel && <Icon name="ti-check" size={14} color={theme.primary} />}
                </Pressable>
              );
            })}
            <Pressable onPress={selectOther} className="flex-row items-center gap-2 py-2.5 pt-3">
              <Text
                className="flex-1 text-sm italic"
                style={{
                  color: otherMode ? theme.primary : theme.textSecondary,
                  fontWeight: otherMode ? '600' : '400'
                }}
              >
                Other — not in this list
              </Text>
              {otherMode && <Icon name="ti-check" size={14} color={theme.primary} />}
            </Pressable>
          </View>
        </Modal>
      )}
    </View>
  );
}
