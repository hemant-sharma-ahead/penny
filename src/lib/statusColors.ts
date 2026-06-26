/**
 * Semantic status colors — the TypeScript mirror of the `--color-*` tokens in index.css.
 *
 * Use these for component props (`<Badge color={STATUS.success}>`, `<IconBadge color={...}>`)
 * and inline `style` values. For plain className styling, prefer the `text-*` / `bg-*-subtle`
 * utilities instead. Never hardcode status hex literals (#10b981, #ef4444, …) in feature code.
 */
export const STATUS = {
  success: 'var(--color-success)',
  danger: 'var(--color-danger)',
  warning: 'var(--color-warning)',
  info: 'var(--color-info)',
  neutral: 'var(--color-neutral)'
} as const;

export type StatusKey = keyof typeof STATUS;

/**
 * Returns a translucent tint of any color for subtle backgrounds — the token-safe replacement
 * for the `${color}1a` hex-concat pattern (which breaks with `var(--…)` colors).
 */
export function tint(color: string, pct = 12): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

/**
 * Returns a readable "ink" shade of a status color by mixing it toward the theme text color.
 * Stays legible on a subtle-tinted background in both light and dark themes (replaces the
 * hardcoded `-700` Tailwind text shades used in callouts).
 */
export function ink(color: string, pct = 70): string {
  return `color-mix(in srgb, ${color} ${pct}%, var(--color-text-primary))`;
}
