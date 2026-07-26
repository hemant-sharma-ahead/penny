import { useEffect, useMemo, useRef, useState } from 'react';
import { SearchInput } from '@/components/ui';
import { CATEGORY_ICON_GROUPS } from '@/core/expenses/categoryIcons';

interface IconEntry {
  n: string; // icon name without the `ti-` prefix
  t: string[]; // search tags
}

interface Props {
  /** Currently selected icon as a full `ti-*` class. */
  value: string;
  onChange: (icon: string) => void;
  color?: string;
}

// Module-level cache so the ~600 KB index is fetched at most once per session.
let indexCache: IconEntry[] | null = null;
let indexPromise: Promise<IconEntry[]> | null = null;

function loadIconIndex(): Promise<IconEntry[]> {
  if (indexCache) return Promise.resolve(indexCache);
  if (!indexPromise) {
    indexPromise = fetch(`${import.meta.env.BASE_URL}tablerIconIndex.json`)
      .then((r) => r.json() as Promise<IconEntry[]>)
      .then((data) => {
        indexCache = data;
        return data;
      })
      .catch(() => {
        indexPromise = null;
        return [];
      });
  }
  return indexPromise;
}

const MAX_RESULTS = 60;

export function IconGridPicker({ value, onChange, color = 'var(--color-primary)' }: Props) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<IconEntry[] | null>(indexCache);
  const loadedFor = useRef(false);

  const searching = query.trim().length > 0;

  useEffect(() => {
    if (searching && !loadedFor.current) {
      loadedFor.current = true;
      void loadIconIndex().then(setIndex);
    }
  }, [searching]);

  const results = useMemo(() => {
    if (!searching || !index) return [];
    const q = query.trim().toLowerCase();
    const out: string[] = [];
    for (const entry of index) {
      if (entry.n.includes(q) || entry.t.some((tag) => tag.includes(q))) {
        out.push(`ti-${entry.n}`);
        if (out.length >= MAX_RESULTS) break;
      }
    }
    return out;
  }, [searching, index, query]);

  function renderIcon(icon: string) {
    const selected = icon === value;
    return (
      <button
        key={icon}
        type="button"
        onClick={() => onChange(icon)}
        className="flex items-center justify-center p-2 rounded-xl border-2 transition-colors bg-surface-2"
        style={{ borderColor: selected ? color : 'transparent' }}
        aria-label={icon}
        aria-pressed={selected}
      >
        <i
          className={`ti ${icon}`}
          style={{ fontSize: 18, color: selected ? color : 'var(--color-text-secondary)' }}
          aria-hidden="true"
        />
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchInput value={query} onChange={setQuery} placeholder="Search all icons…" />

      {searching ? (
        results.length > 0 ? (
          <div className="grid grid-cols-6 gap-1.5 max-h-48 overflow-y-auto">{results.map(renderIcon)}</div>
        ) : (
          <p className="text-xs text-tertiary text-center py-4">{index ? 'No icons found' : 'Loading icons…'}</p>
        )
      ) : (
        <div className="flex flex-col gap-3 max-h-48 overflow-y-auto">
          {CATEGORY_ICON_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary mb-1.5">{group.label}</p>
              <div className="grid grid-cols-6 gap-1.5">{group.icons.map(renderIcon)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
