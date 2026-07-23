/** Compact segmented control for an optional field — tap the active segment again to clear it.
 *  Distinct from SegmentedControl (which requires a value and doesn't support clearing) because these
 *  Life & household fields are deliberately clearable. Shared by Edit Profile and onboarding. */
export function OptionalSeg({
  options,
  value,
  onChange
}: {
  options: { value: string; label: string }[];
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <span className="inline-flex bg-surface-2 border border-theme rounded-lg p-0.5 gap-0.5">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(on ? undefined : o.value)}
            className={`text-[11.5px] font-semibold px-2.5 py-1.5 rounded-md transition-colors ${on ? 'bg-surface shadow-sm' : ''}`}
            style={{ color: on ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}
          >
            {o.label}
          </button>
        );
      })}
    </span>
  );
}
