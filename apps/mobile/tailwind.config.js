// Colours are CSS-variable references, not static hex — the actual per-theme hex values live in
// packages/core/src/theme/tokens.ts (the single source of truth shared with apps/web-legacy's CSS
// custom properties) and are applied at runtime by src/theme/ThemeProvider.tsx via NativeWind's
// vars(), so switching theme/dark-mode doesn't require rebuilding styles per screen.
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        'primary-dark': 'var(--color-primary-dark)',
        'primary-light': 'var(--color-primary-light)',
        surface: 'var(--color-surface)',
        'surface-secondary': 'var(--color-surface-secondary)',
        'surface-tertiary': 'var(--color-surface-tertiary)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-tertiary': 'var(--color-text-tertiary)',
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
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
