interface IconBadgeProps {
  icon: string;
  color: string;
  /** sm = w-8 h-8 rounded-lg icon-16, md = w-10 h-10 rounded-xl icon-20 (default), lg = w-12 h-12 rounded-xl icon-24 */
  size?: 'sm' | 'md' | 'lg';
  /** Background color override — defaults to color + '18' hex tint */
  bg?: string | undefined;
  className?: string;
}

const SIZE = {
  sm: { box: 'w-8 h-8 rounded-lg', icon: 16 },
  md: { box: 'w-10 h-10 rounded-xl', icon: 20 },
  lg: { box: 'w-12 h-12 rounded-xl', icon: 24 }
} as const;

export function IconBadge({ icon, color, size = 'md', bg, className = '' }: IconBadgeProps) {
  const { box, icon: iconSize } = SIZE[size];
  return (
    <div
      className={`${box} flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ backgroundColor: bg ?? `${color}18` }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: iconSize, color }} aria-hidden="true" />
    </div>
  );
}
