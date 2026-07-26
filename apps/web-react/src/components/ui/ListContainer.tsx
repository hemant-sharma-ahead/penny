import type { ReactNode } from 'react';

interface ListContainerProps {
  children: ReactNode;
  /** Layout-only extra classes on the outer container. */
  className?: string;
}

/**
 * Bordered, rounded surface that hairline-divides its direct children — the
 * standard wrapper for grouped list rows (accounts, transactions, previews).
 */
export function ListContainer({ children, className = '' }: ListContainerProps) {
  return (
    <div className={`surface rounded-xl overflow-hidden divide-y divide-[var(--color-border)] ${className}`.trim()}>
      {children}
    </div>
  );
}
