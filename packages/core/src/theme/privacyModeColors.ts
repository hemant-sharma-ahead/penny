// Until 2026-07-31 this returned a different header/page-background tint per Privacy Mode
// (Safe/Private/Open) layered on top of the base theme. Removed by deliberate decision: the app now
// uses one consistent palette per theme regardless of privacy mode — the mode itself is unchanged
// (still real, still shown via `PrivacyModeSwitcher`'s icon), it just no longer repaints the screen.
// Kept as a function (not inlined at each of its ~25 call sites across `apps/mobile`) so the values are
// still centralized in one place; `mode` is intentionally unused now — signature kept stable so none of
// those call sites (which just consume `.bg`/`.accent`/`.headerBg` as plain colors) need to change.

export interface PrivacyModeColors {
  /** Header's bottom border / accent color. */
  accent: string;
  /** Header background. */
  headerBg: string;
  /** Page/content background. */
  bg: string;
}

export type PrivacyModeName = 'safe' | 'privacy' | 'open';

const LIGHT_COLORS: PrivacyModeColors = { accent: '#3b82f6', headerBg: '#ffffff', bg: '#e4eeff' };
const DARK_COLORS: PrivacyModeColors = { accent: '#3b82f6', headerBg: '#161b22', bg: '#0b0f14' };

/** `themePalette` is any of `packages/core/src/theme/tokens.ts`'s `ThemeName` — 'pennyBlue' and 'dark'
 *  share the same dark-ish values (matching every other per-palette split in this codebase). */
export function getPrivacyModeColors(_mode: PrivacyModeName, themePalette: string): PrivacyModeColors {
  return themePalette === 'light' ? LIGHT_COLORS : DARK_COLORS;
}
