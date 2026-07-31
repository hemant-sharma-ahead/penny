import { useMemo, useState } from 'react';
import { View, TextInput as RNTextInput, Pressable, Text } from 'react-native';
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
 * Type-ahead over existing persons with a "Create '<typed>'" affordance. Web renders the suggestion list
 * as a DOM-positioned `absolute` overlay; the suggestions here render the same way — `position:
 * 'absolute'` anchored below the field, with `elevation` for Android's stacking-context equivalent of
 * z-index — instead of the earlier approach of rendering inline in normal document flow, which pushed
 * the rest of the (scrollable) form down (found via the 2026-07-25 parity sweep). Unlike `SelectInput`
 * (a fixed option list, rebuilt on the shared centered `Modal`), this is a live type-ahead search with a
 * "Create" affordance tightly coupled to the text field itself, so an overlay anchored to the field reads
 * more naturally here than a full-screen modal.
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
      <View style={{ position: 'relative', zIndex: showList ? 50 : undefined }}>
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
          <View
            className="bg-surface border border-theme rounded-xl overflow-hidden"
            style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, elevation: 6, zIndex: 50 }}
          >
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
      </View>
    </FormField>
  );
}
