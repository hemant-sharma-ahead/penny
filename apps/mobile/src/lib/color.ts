/**
 * RN equivalent of packages/core/src/lib/statusColors.ts's `tint()`/`ink()` helpers, which use CSS
 * `color-mix()` — a string the CSS engine parses, not something React Native's style engine understands
 * (RN needs real hex/rgb/rgba values). This is a genuine, intentional platform difference (flagged, not
 * silently patched): RN natively supports alpha channels, so `tint()` (originally "mix toward
 * transparent") becomes a direct `rgba()` with the same percentage as alpha — mathematically the same
 * translucent-over-background effect. `ink()` (mix toward the theme's text color) needs real channel
 * blending since both inputs are opaque.
 */

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

/** Translucent tint of a hex color for subtle backgrounds — pct is the resulting opacity (0-100). */
export function tint(hex: string, pct = 12): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${pct / 100})`;
}

/** Blends a hex color toward another (typically the theme's text-primary) — pct is how much of the
 * first color survives (0-100); the rest is the second color. Both inputs must be opaque hex. */
export function ink(hex: string, towardHex: string, pct = 70): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(towardHex);
  const mix = (ca: number, cb: number) => Math.round((ca * pct + cb * (100 - pct)) / 100);
  return `rgb(${mix(a.r, b.r)}, ${mix(a.g, b.g)}, ${mix(a.b, b.b)})`;
}
