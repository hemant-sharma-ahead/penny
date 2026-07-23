interface DismissibleChipProps {
  label: string;
  onDismiss: () => void;
  /** Solid background color (hex). Defaults to primary green. */
  color?: string;
  icon?: string;
}

export function DismissibleChip({ label, onDismiss, color = 'var(--color-primary)', icon }: DismissibleChipProps) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {icon && <i className={`ti ${icon}`} style={{ fontSize: 11 }} aria-hidden="true" />}
      {label}
      <i className="ti ti-x" style={{ fontSize: 10 }} aria-hidden="true" />
    </button>
  );
}
