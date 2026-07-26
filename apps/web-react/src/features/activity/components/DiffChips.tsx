import { prettifyField } from '../activityMeta';

interface Props {
  diff: string; // JSON { field: [before, after] }
  masked: boolean;
}

function fmt(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

/** Renders an UPDATE diff as friendly before→after chips. Values hidden when masked. */
export function DiffChips({ diff, masked }: Props) {
  let parsed: Record<string, [unknown, unknown]>;
  try {
    parsed = JSON.parse(diff) as Record<string, [unknown, unknown]>;
  } catch {
    return null;
  }
  const fields = Object.keys(parsed);
  if (fields.length === 0) return null;

  if (masked) {
    return <p className="text-[11px] text-tertiary mt-0.5">Changed: {fields.map(prettifyField).join(', ')}</p>;
  }

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {fields.map((f) => {
        const [before, after] = parsed[f] ?? [undefined, undefined];
        const isId = /Id$/.test(f);
        return (
          <span
            key={f}
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-surface-2 text-secondary"
          >
            <span className="font-medium">{prettifyField(f)}</span>
            {!isId && (
              <span className="text-tertiary">
                {fmt(before)} → {fmt(after)}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
