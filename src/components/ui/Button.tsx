import type { MouseEventHandler, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  loading?: boolean;
  /** Tabler icon class, e.g. 'ti-plus'. Rendered before children (or alone for icon-only buttons). */
  icon?: string;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
  'aria-label'?: string;
  className?: string;
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1',
  md: 'px-4 py-2.5 text-sm rounded-xl gap-1.5',
  lg: 'px-4 py-3 text-sm rounded-xl gap-2'
};

const ICON_SIZES: Record<ButtonSize, number> = { sm: 13, md: 15, lg: 16 };

function variantStyle(variant: ButtonVariant): React.CSSProperties {
  if (variant === 'primary') return { backgroundColor: 'var(--color-primary)', color: '#fff' };
  if (variant === 'danger') return { backgroundColor: 'var(--color-open)', color: '#fff' };
  return {};
}

function variantClass(variant: ButtonVariant): string {
  if (variant === 'secondary') return 'border border-theme text-secondary bg-transparent hover:bg-surface-2';
  if (variant === 'ghost') return 'text-secondary bg-transparent hover:bg-surface-2';
  return '';
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  disabled,
  loading,
  icon,
  fullWidth,
  type = 'button',
  'aria-label': ariaLabel,
  className = ''
}: ButtonProps) {
  const iconOnly = !children && (icon || loading);
  const iconSize = ICON_SIZES[size];

  const baseClass = [
    'inline-flex items-center justify-center font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
    iconOnly ? 'aspect-square' : SIZE_CLASSES[size],
    fullWidth ? 'w-full' : '',
    variantClass(variant),
    className
  ]
    .filter(Boolean)
    .join(' ');

  const iconEl = (loading || icon) && (
    <i
      className={`ti ${loading ? 'ti-loader-2 animate-spin' : icon}`}
      style={{ fontSize: iconSize }}
      aria-hidden="true"
    />
  );

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled ?? loading}
      aria-label={ariaLabel}
      className={baseClass}
      style={variantStyle(variant)}
    >
      {iconEl}
      {children && <span>{children}</span>}
    </button>
  );
}
