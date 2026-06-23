type BadgeVariant = 'solid' | 'subtle';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  label: string;
  /** CSS color value — e.g. 'var(--color-primary)' or '#ef4444' */
  color?: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
}

const SIZE_CLASS: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-xs'
};

export function Badge({ label, color = 'var(--color-primary)', variant = 'subtle', size = 'md' }: BadgeProps) {
  const style =
    variant === 'solid'
      ? { backgroundColor: color, color: '#fff' }
      : { backgroundColor: `${color}1a`, color };

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full leading-none ${SIZE_CLASS[size]}`}
      style={style}
    >
      {label}
    </span>
  );
}
