import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  /** Inner padding. xs=p-3, sm=p-3.5, md=p-4 (default), lg=p-5 */
  padding?: 'xs' | 'sm' | 'md' | 'lg';
  /** Corner radius. md=rounded-xl, lg=rounded-2xl (default) */
  radius?: 'md' | 'lg';
  /** Makes the card a tappable button */
  onClick?: () => void;
  /** Layout-only classes (flex, gap, grid, overflow). No colours or spacing — those belong inside. */
  className?: string;
}

const PADDING = { xs: 'p-3', sm: 'p-3.5', md: 'p-4', lg: 'p-5' } as const;
const RADIUS = { md: 'rounded-xl', lg: 'rounded-2xl' } as const;

export function Card({ children, padding = 'md', radius = 'lg', onClick, className = '' }: CardProps) {
  const base = `surface ${RADIUS[radius]} ${PADDING[padding]} ${className}`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} w-full text-left`}>
        {children}
      </button>
    );
  }

  return <div className={base}>{children}</div>;
}
