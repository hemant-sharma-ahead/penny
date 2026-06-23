import type { ReactNode } from 'react';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** Padding class override — defaults to 'px-4 pt-5 pb-2' */
  className?: string;
}

export function SectionHeader({ title, subtitle, action, className = 'px-4 pt-5 pb-2' }: SectionHeaderProps) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="flex flex-col">
        <h2 className="text-sm font-semibold text-primary">{title}</h2>
        {subtitle && <p className="text-xs text-tertiary mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
