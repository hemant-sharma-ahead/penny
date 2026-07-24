import { useMemo, useState } from 'react';
import { View, Text, TextInput as RNTextInput, Pressable } from 'react-native';
import type { Person } from '@/core/db/types';
import { FormField } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

interface PersonPickerProps {
  persons: Person[];
  /** Controlled query text (the typed name). */
  query: string;
  onQueryChange: (q: string) => void;
  /** Called when an existing person is picked from the suggestions. */
  onSelect: (person: Person) => void;
  autoFocus?: boolean;
  label?: string;
}

/**
 * Type-ahead over existing persons with a "Create '<typed>'" affordance. RN port note: web renders the
 * suggestion list as a DOM-positioned `absolute` overlay; RN has no equivalent (same reasoning as
 * `SelectInput`'s port note), so this renders the suggestions inline, in normal document flow, below the
 * field — pushes the rest of the (scrollable) form down instead of floating over it.
 */
export function PersonPicker({
  persons,
  query,
  onQueryChange,
  onSelect,
  autoFocus,
  label = 'Person'
}: PersonPickerProps) {
  const theme = useThemeColors();
  const [focused, setFocused] = useState(false);
  const q = query.trim().toLowerCase();

  const matches = useMemo(() => {
    const active = persons.filter((p) => !p.isArchived);
    return (q ? active.filter((p) => p.name.toLowerCase().includes(q)) : active).slice(0, 6);
  }, [persons, q]);

  const exact = persons.some((p) => p.name.toLowerCase() === q);
  const showCreate = q.length > 0 && !exact;
  const showList = focused && (matches.length > 0 || showCreate);

  return (
    <FormField label={label} required>
      <RNTextInput
        value={query}
        autoFocus={autoFocus}
        placeholder="Type a name…"
        placeholderTextColor={theme.textTertiary}
        onChangeText={onQueryChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 120)}
        className="bg-surface-2 text-primary border w-full rounded-xl px-3 py-2.5 text-sm"
        style={{ borderColor: theme.border }}
      />
      {showList && (
        <View className="mt-1 bg-surface border border-theme rounded-xl overflow-hidden">
          {matches.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => {
                onSelect(p);
                setFocused(false);
              }}
              className="px-3 py-2 border-b border-theme"
            >
              <Text className="text-sm text-primary">{p.name}</Text>
            </Pressable>
          ))}
          {showCreate && (
            <Pressable
              onPress={() => {
                onQueryChange(query.trim());
                setFocused(false);
              }}
              className="flex-row items-center gap-1.5 px-3 py-2"
            >
              <Icon name="ti-plus" size={14} color={theme.textPrimary} />
              <Text className="text-sm text-primary">Create "{query.trim()}"</Text>
            </Pressable>
          )}
        </View>
      )}
    </FormField>
  );
}
