import type { ReactNode } from 'react';

interface DetailRowProps {
  label: ReactNode;
  value: ReactNode;
  /** sm = text-xs (default), md = text-sm */
  size?: 'sm' | 'md';
  className?: string;
}

export function DetailRow({ label, value, size = 'sm', className = '' }: DetailRowProps) {
  const textSize = size === 'md' ? 'text-sm' : 'text-xs';
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <span className={`${textSize} text-secondary`}>{label}</span>
      <span className={`${textSize} font-semibold text-primary tabular-nums text-right`}>{value}</span>
    </div>
  );
}
