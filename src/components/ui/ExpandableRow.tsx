import type { ReactNode } from 'react';

interface ExpandableRowProps {
  isExpanded: boolean;
  onToggle: () => void;
  /** Content rendered in the always-visible header row */
  header: ReactNode;
  /** Content shown only when expanded */
  children?: ReactNode;
  className?: string;
}

export function ExpandableRow({ isExpanded, onToggle, header, children, className = '' }: ExpandableRowProps) {
  return (
    <div className={className}>
      <button
        type="button"
        className="w-full flex items-center gap-2 text-left"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div className="flex-1 min-w-0">{header}</div>
        <i
          className={`ti ${isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'} flex-shrink-0 text-tertiary`}
          style={{ fontSize: 14 }}
          aria-hidden="true"
        />
      </button>
      {isExpanded && children}
    </div>
  );
}
