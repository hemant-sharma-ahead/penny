import { useMemo, useState } from 'react';
import type { Person } from '@/core/db/types';
import { FormField } from '@/components/ui';

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

/** Type-ahead over existing persons with a "Create '<typed>'" affordance. Controlled by the parent. */
export function PersonPicker({
  persons,
  query,
  onQueryChange,
  onSelect,
  autoFocus,
  label = 'Person'
}: PersonPickerProps) {
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
      <div className="relative">
        <input
          className="input-surface w-full rounded-xl px-3 py-2.5 text-sm"
          value={query}
          autoFocus={autoFocus}
          placeholder="Type a name…"
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
        />
        {showList && (
          <div className="absolute z-10 left-0 right-0 mt-1 bg-surface border border-theme rounded-xl shadow-lg overflow-hidden">
            {matches.map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 text-primary"
                onClick={() => {
                  onSelect(p);
                  setFocused(false);
                }}
              >
                {p.name}
              </button>
            ))}
            {showCreate && (
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 text-primary border-t border-theme"
                onClick={() => {
                  onQueryChange(query.trim());
                  setFocused(false);
                }}
              >
                <i className="ti ti-plus mr-1.5" aria-hidden="true" />
                Create &ldquo;{query.trim()}&rdquo;
              </button>
            )}
          </div>
        )}
      </div>
    </FormField>
  );
}
