// Extracted from apps/web-react/src/index.css's `[data-privacy-mode=...]` / `[data-theme=...]
// [data-privacy-mode=...]` rules — the header/page-background tint that layers on top of the base
// theme (light/pennyBlue/dark) depending on the current Privacy Mode (Safe/Private/Open). Two variants
// only: "light" (used with the `light` theme) and "dark-ish" (used with both `pennyBlue` and `dark`,
// which share identical overrides on web too — see the combined `[data-theme='blue'][data-privacy-mode=...],
// [data-theme='dark'][data-privacy-mode=...]` selectors).

export interface PrivacyModeColors {
  /** Header's bottom border / accent color for the active mode. */
  accent: string;
  /** Header background tint. */
  headerBg: string;
  /** Page/content background tint. */
  bg: string;
}

export type PrivacyModeName = 'safe' | 'privacy' | 'open';

const LIGHT_MODE_COLORS: Record<PrivacyModeName, PrivacyModeColors> = {
  safe: { accent: '#f59e0b', headerBg: '#fef3c7', bg: '#fffbeb' },
  privacy: { accent: '#7c3aed', headerBg: '#ede9fe', bg: '#f5f3ff' },
  open: { accent: '#dc2626', headerBg: '#fee2e2', bg: '#fff1f2' }
};

const DARK_MODE_COLORS: Record<PrivacyModeName, PrivacyModeColors> = {
  safe: { accent: '#f59e0b', headerBg: '#2a1c08', bg: '#1e1508' },
  privacy: { accent: '#7c3aed', headerBg: '#1e1030', bg: '#170d25' },
  open: { accent: '#dc2626', headerBg: '#2d0a0a', bg: '#1a0505' }
};

/** `themePalette` is any of `packages/core/src/theme/tokens.ts`'s `ThemeName` — 'pennyBlue' and 'dark'
 *  share the same dark-ish overrides, matching web's combined CSS selector. */
export function getPrivacyModeColors(mode: PrivacyModeName, themePalette: string): PrivacyModeColors {
  const table = themePalette === 'light' ? LIGHT_MODE_COLORS : DARK_MODE_COLORS;
  return table[mode];
}
