import type { ReactNode } from 'react';

/** A labelled row for one optional "Life & household" field — shared by Edit Profile and the
 *  onboarding "A bit more about you" screen so both stay visually identical. */
export function LifeRow({
  icon,
  label,
  alignTop,
  children
}: {
  icon: string;
  label: string;
  alignTop?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex ${alignTop ? 'items-start' : 'items-center'} justify-between gap-3 py-3 border-t border-theme`}
    >
      <span className="text-[13px] font-medium text-secondary flex items-center gap-2 flex-shrink-0">
        <i className={`ti ${icon} text-tertiary`} style={{ fontSize: 17 }} aria-hidden="true" />
        {label}
      </span>
      {children}
    </div>
  );
}
