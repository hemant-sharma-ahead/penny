import { tint } from '@/lib/statusColors';

type BadgeVariant = 'solid' | 'subtle';
type BadgeSize = 'sm' | 'md';
type BadgeRounded = 'full' | 'md';

interface BadgeProps {
  label: string;
  /** CSS color value — e.g. STATUS.success, 'var(--color-primary)', or '#ef4444' */
  color?: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  /** Pill (default) or squarer corners for compact inline tags. */
  rounded?: BadgeRounded;
}

const SIZE_CLASS: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-xs'
};

const ROUNDED_CLASS: Record<BadgeRounded, string> = {
  full: 'rounded-full',
  md: 'rounded'
};

export function Badge({
  label,
  color = 'var(--color-primary)',
  variant = 'subtle',
  size = 'md',
  rounded = 'full'
}: BadgeProps) {
  const style =
    variant === 'solid' ? { backgroundColor: color, color: '#fff' } : { backgroundColor: tint(color), color };

  return (
    <span
      className={`inline-flex items-center font-semibold leading-none ${SIZE_CLASS[size]} ${ROUNDED_CLASS[rounded]}`}
      style={style}
    >
      {label}
    </span>
  );
}
