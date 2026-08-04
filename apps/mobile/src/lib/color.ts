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

/**
 * RN equivalent of a colored-tile picker's web `boxShadow` selection halo
 * (`0 0 0 2px var(--color-surface), 0 0 0 3.5px ${item.color}`) — a surface-colored gap, then a ring in
 * the item's own color. RN has no boxShadow, so this wraps the tile in a padded, bordered container
 * instead: the padding is the gap, the border is the halo. Pass the inner tile's own `borderRadius` so
 * the outer wrapper's radius (`innerRadius + padding`) stays concentric. Used by
 * `AccountChips`/`PaymentModeChips`/`CategoryPickerModal`'s tile selection indicators — every one of
 * these previously drew the ring in a static `theme.surface` color regardless of the item's own color,
 * making the selected state hard to distinguish from the tile's own background.
 */
export interface AccountCardPalette {
  /** Two gradient stops, dark → darker, for the card's full-bleed background. */
  readonly gradient: readonly [string, string];
  /** Bright accent used only for the low-opacity corner glow blob, never as a solid fill. */
  readonly glow: string;
}

/**
 * Curated dark jewel-tone gradient pairs for `AccountList.tsx`'s mini cards
 * (`docs/mockups/proposals/accounts-list-v1.html`, "Direction D — Mini Cards v2"). Supersedes the old
 * `accentCardGradient(acc.color)` (derived from the account's own free-pick `color` field via `ink()`),
 * which is why the first shipped version looked flat/dull and near-identical for same-typed accounts —
 * a user-customizable single hex has no guaranteed contrast or "real card" richness. These are hand-picked
 * to match in saturation/darkness; assignment (not colour choice) is what varies per account — see
 * `accountCardPalette()` below.
 */
const JEWEL_PALETTE: readonly AccountCardPalette[] = [
  { gradient: ['#7a1d3f', '#2e0f1f'], glow: '#ff4d7a' }, // wine
  { gradient: ['#16234f', '#0c1530'], glow: '#4d7aff' }, // sapphire
  { gradient: ['#5c3a12', '#241505'], glow: '#f0b060' }, // bronze/gold
  { gradient: ['#4a1d6b', '#1f0d2e'], glow: '#b06bff' }, // violet
  { gradient: ['#6b1d35', '#2e0f18'], glow: '#ff6b95' }, // rose
  { gradient: ['#6b4a12', '#2e1f05'], glow: '#ffce54' }, // amber
  { gradient: ['#2a1d6b', '#100d2e'], glow: '#6b7aff' }, // indigo
  { gradient: ['#5c1d5c', '#241024'], glow: '#e06bff' } // plum
];

/**
 * Cash/wallet accounts are always clamped to this green-only subset (never fall through to
 * `JEWEL_PALETTE`), so "green = cash" stays a reliable visual cue regardless of the per-account hash.
 */
const GREEN_PALETTE: readonly AccountCardPalette[] = [
  { gradient: ['#155c3f', '#0a2e20'], glow: '#10b981' }, // emerald
  { gradient: ['#0f5c50', '#082e28'], glow: '#2de0c0' }, // teal-green
  { gradient: ['#1a4a2e', '#0a2214'], glow: '#4ade80' }, // forest
  { gradient: ['#0d4d42', '#052620'], glow: '#34d399' } // jade
];

function hashToIndex(id: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % length;
}

/**
 * Deterministically assigns one of the curated palettes above to an account, hashed off its `id` — NOT
 * its type and NOT its user-chosen `color` — so two accounts sharing a type (e.g. two "Bank" accounts)
 * reliably land on different cards, which is the whole point of this v2 pass (see module doc comment on
 * `JEWEL_PALETTE`). `isCashLike` is the one hard rule: pass `true` for `cash`/`wallet` account types to
 * clamp into `GREEN_PALETTE` regardless of the hash; every other type hashes freely into `JEWEL_PALETTE`.
 * The same `id` always resolves to the same card on every render/relaunch — no stored assignment needed.
 */
export function accountCardPalette(id: string, isCashLike: boolean): AccountCardPalette {
  const pool = isCashLike ? GREEN_PALETTE : JEWEL_PALETTE;
  return pool[hashToIndex(id, pool.length)];
}

export function selectionRingStyle(selected: boolean, surfaceColor: string, itemColor: string, innerRadius = 10) {
  const gap = 2;
  return {
    padding: gap,
    borderRadius: innerRadius + gap,
    borderWidth: gap,
    borderColor: selected ? itemColor : 'transparent',
    backgroundColor: selected ? surfaceColor : 'transparent'
  } as const;
}
