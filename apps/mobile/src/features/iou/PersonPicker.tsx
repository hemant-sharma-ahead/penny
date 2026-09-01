import type { Person } from '@/core/db/types';
import { FormField } from '~/components/ui';
import { PersonTypeahead } from '~/components/shared';

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
 *
 * The actual field + dropdown is `components/shared/PersonTypeahead.tsx` (extracted 2026-08-18, item
 * 12 — `ExpenseForm.tsx`'s Lent/Borrowed panel and the bulk-add-to-IOU wizard both need the same
 * type-ahead but can't import from `features/iou/`) — this wrapper just adds the required-field
 * `FormField` label, matching this screen's own field convention.
 */
export function PersonPicker({
  persons,
  query,
  onQueryChange,
  onSelect,
  autoFocus,
  label = 'Person'
}: PersonPickerProps) {
  return (
    <FormField label={label} required>
      <PersonTypeahead
        persons={persons}
        query={query}
        onQueryChange={onQueryChange}
        onSelect={onSelect}
        autoFocus={autoFocus}
      />
    </FormField>
  );
}
