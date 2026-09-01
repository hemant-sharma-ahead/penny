import { forwardRef, useMemo, useState } from 'react';
import { View, TextInput as RNTextInput, Pressable, Text } from 'react-native';
import type { Person } from '@/core/db/types';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

interface PersonTypeaheadProps {
  persons: Person[];
  /** Controlled query text (the typed name). */
  query: string;
  onQueryChange: (q: string) => void;
  /** Called when an existing person is picked from the suggestions. */
  onSelect: (person: Person) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Border-only error styling — the caller renders its own error caption below (matches this
   *  component's callers, which each already have their own field-level error text convention). */
  error?: boolean;
}

/**
 * Shared type-ahead over existing IOU persons with a "Create '<typed>'" affordance — the field-level
 * dropdown UI extracted out of `features/iou/PersonPicker.tsx` (2026-08-18, item 12/26 real-device
 * testing pass) so it can be reused from `components/shared/ExpenseForm.tsx`'s Lent/Borrowed panel and
 * the bulk-add-to-IOU wizard's person step, neither of which may import from `features/iou/` (feature
 * modules only import downward from `core/`/`components/`/`context/`/`hooks/`/`lib/`, never from each
 * other, and `components/shared` sits below every feature). `PersonPicker.tsx` now wraps this component
 * with its own `FormField` label/required styling — this component owns just the input + dropdown.
 *
 * Matched substrings are bolded (2026-08-18) — a small enhancement over the original `PersonPicker`
 * behavior, added here and inherited by both callers, per the mockup
 * (`docs/mockups/proposals/iou-quick-fixes-v1.html` §2).
 *
 * Forwards its ref straight to the inner `RNTextInput` (2026-08-20, item 32/36 real-device testing
 * pass) — lets `BulkAddToIouModal.tsx`'s person step apply the same `Modal`'s `onShow` + ref →
 * `.focus()` fix already used by `ExpenseForm.tsx`'s description field and `ui/TextInput.tsx`.
 */
export const PersonTypeahead = forwardRef<RNTextInput, PersonTypeaheadProps>(function PersonTypeahead(
  { persons, query, onQueryChange, onSelect, placeholder = 'Type a name…', autoFocus, error },
  ref
) {
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

  function renderMatch(name: string) {
    const idx = q ? name.toLowerCase().indexOf(q) : -1;
    if (idx === -1) {
      return <Text className="text-sm text-primary">{name}</Text>;
    }
    return (
      <Text className="text-sm text-primary">
        {name.slice(0, idx)}
        <Text style={{ fontWeight: '700', color: theme.primary }}>{name.slice(idx, idx + q.length)}</Text>
        {name.slice(idx + q.length)}
      </Text>
    );
  }

  return (
    // `zIndex` deliberately fixed, not toggled on `showList`/`focused` (real-device testing, 2026-08-21):
    // every single tap into this field produced a `focus` immediately followed by a self-inflicted
    // `blur` within milliseconds, confirmed via on-device focus/blur tracing — every time, not
    // sporadically. Root cause: this wrapper's `zIndex` used to flip `undefined → 50` on the exact
    // same state change (`focused` becoming true) that fires the focus event; changing a View's
    // `zIndex` on Android can force it to recreate its native rendering layer, and doing that to the
    // direct ancestor of a view that just received IME focus is enough for Android to defensively drop
    // the keyboard. The dropdown below already carries its own fixed `zIndex: 50`, so this wrapper never
    // needed a dynamic value in the first place.
    <View style={{ position: 'relative', zIndex: 50 }}>
      <RNTextInput
        ref={ref}
        value={query}
        autoFocus={autoFocus}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        onChangeText={(v) => {
          onQueryChange(v);
        }}
        onFocus={() => {
          setFocused(true);
        }}
        onBlur={() => {
          setTimeout(() => setFocused(false), 120);
        }}
        className="bg-surface-2 text-primary border w-full rounded-xl px-3 py-2.5 text-sm"
        style={{
          borderColor: error ? theme.danger : theme.border,
          includeFontPadding: false,
          textAlignVertical: 'center'
        }}
      />
      {/* Always mounted (never conditionally rendered) — real-device testing feedback, 2026-08-21:
       *  "keyboard appears then disappears right as the Create suggestion comes in". Root cause:
       *  this whole subtree used to only get created the instant `showList` first became true (e.g.
       *  the very first keystroke that produces a "Create '<name>'" row) — inserting a brand-new
       *  native view into the tree while the `RNTextInput` above is actively focused is a known way
       *  Android's keyboard/focus handling gets confused and dismisses the keyboard. Toggling `display`
       *  on an already-mounted view has none of that risk — nothing new gets inserted mid-typing,
       *  only content/visibility on a view that's existed since this component's own first render. */}
      <View
        className="bg-surface border border-theme rounded-xl overflow-hidden"
        style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 4,
          elevation: 6,
          zIndex: 50,
          display: showList ? 'flex' : 'none'
        }}
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
            {renderMatch(p.name)}
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
            <Text className="text-sm text-primary">Create &quot;{query.trim()}&quot;</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
});
