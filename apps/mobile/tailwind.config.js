// Colours are CSS-variable references, not static hex — the actual per-theme hex values live in
// packages/core/src/theme/tokens.ts (the single source of truth shared with apps/web-legacy's CSS
// custom properties) and are applied at runtime by src/theme/ThemeProvider.tsx via NativeWind's
// vars(), so switching theme/dark-mode doesn't require rebuilding styles per screen.
//
// The color KEY names here are chosen to reproduce the exact same utility-class vocabulary
// apps/web-legacy/src/index.css defines (see its "Semantic theme utilities" section) — e.g. the color
// key must be `primary` (not `text-primary`) to get a `text-primary` class at all, and `primary` here
// means the *text* token (--color-text-primary), NOT the brand-green accent, exactly matching web's
// meaning of `text-primary`/`bg-surface`/etc. The brand accent color (web's `var(--color-primary)`,
// used only via inline styles/props on web, never as a className) is deliberately NOT a Tailwind color
// here either — ported components resolve it via `useThemeColors().primary` (real hex) instead, the
// same as every other prop-driven inline color.
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-secondary)',
        'surface-3': 'var(--color-surface-tertiary)',
        // Aliases for the same two tokens — both spellings are used across apps/mobile/src (found via
        // on-device theme-switching testing, 2026-07-25: `bg-surface-tertiary`/`bg-surface-secondary`
        // aren't valid classes under the `-2`/`-3` names above, so NativeWind silently dropped them on
        // ~33 screens, leaving their backgrounds unthemed). Aliasing here is safer than renaming every
        // call site.
        'surface-secondary': 'var(--color-surface-secondary)',
        'surface-tertiary': 'var(--color-surface-tertiary)',
        primary: 'var(--color-text-primary)',
        secondary: 'var(--color-text-secondary)',
        tertiary: 'var(--color-text-tertiary)',
        theme: 'var(--color-border)',
        'theme-strong': 'var(--color-border-strong)',
        success: 'var(--color-success)',
        danger: 'var(--color-danger)',
        warning: 'var(--color-warning)',
        info: 'var(--color-info)',
        neutral: 'var(--color-neutral)'
      }
    }
  },
  plugins: []
};
