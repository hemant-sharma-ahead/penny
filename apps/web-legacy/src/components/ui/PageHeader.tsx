import type { ReactNode } from 'react';

interface PageHeaderProps {
  /** Heading text (or node). Rendered as the page title. */
  title: ReactNode;
  /** Optional one-line subtitle below the title (e.g. a total or count). */
  subtitle?: ReactNode;
  /** Optional element rendered to the left of the title, e.g. a back button. */
  leading?: ReactNode;
  /** Optional right-aligned actions, e.g. add/import/export buttons. */
  actions?: ReactNode;
  /** Optional full-width content rendered below the title row (custom rows, stat groups). */
  children?: ReactNode;
  /** Layout-only extra classes on the outer container (e.g. flex-shrink-0). */
  className?: string;
}

/**
 * Standard page header: `px-4 pt-4 pb-3` block with a bottom border, a title,
 * and optional leading element, right-aligned actions, subtitle, and a
 * full-width slot below the title row. Use at the top of every feature page.
 */
export function PageHeader({ title, subtitle, leading, actions, children, className = '' }: PageHeaderProps) {
  return (
    <div className={`px-4 pt-4 pb-3 border-b border-theme ${className}`.trim()}>
      <div className="flex items-center gap-3">
        {leading}
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-primary">{title}</h2>
          {subtitle != null && <p className="text-sm mt-0.5 text-secondary">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
