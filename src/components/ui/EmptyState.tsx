interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: string;
}

interface EmptyStateProps {
  /** Tabler icon class, e.g. 'ti-inbox' */
  icon: string;
  title: string;
  description?: string;
  action?: EmptyStateAction;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 px-6 text-center">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ backgroundColor: 'var(--color-primary)1a' }}
      >
        <i className={`ti ${icon}`} style={{ fontSize: 26, color: 'var(--color-primary)' }} aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-primary">{title}</p>
        {description && <p className="text-xs text-tertiary leading-relaxed">{description}</p>}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {action.icon && <i className={`ti ${action.icon}`} style={{ fontSize: 15 }} aria-hidden="true" />}
          {action.label}
        </button>
      )}
    </div>
  );
}
