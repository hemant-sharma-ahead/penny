// Single source of truth for Penny's theme colours, extracted from apps/web-legacy/src/index.css's
// CSS custom properties. Both apps/web-legacy (via its existing CSS vars, unchanged) and apps/mobile
// (via NativeWind, consuming this object directly) are meant to agree with these values — if a colour
// changes here, update index.css too (and vice versa) until Track 7 retires the CSS-var copy.
//
// "System" is not a fourth palette — it's Light or Dark chosen by the OS; the app layer resolves it
// before picking a palette below. Privacy-mode accent overlays (safe/privacy/open header tints) are a
// separate axis layered on top of a base palette and aren't part of this file yet — deferred to
// whichever track ports the privacy-mode UI.

export interface ThemeTokens {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  surface: string;
  surfaceSecondary: string;
  surfaceTertiary: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderStrong: string;
  success: string;
  danger: string;
  warning: string;
  info: string;
  neutral: string;
}

export const THEME_TOKENS = {
  light: {
    primary: '#00a86b',
    primaryDark: '#007a4e',
    primaryLight: '#e1f5ee',
    surface: '#ffffff',
    surfaceSecondary: '#eff6ff',
    surfaceTertiary: '#e4eeff',
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textTertiary: '#94a3b8',
    border: '#c7d8f0',
    borderStrong: '#a5bfdf',
    success: '#10b981',
    danger: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
    neutral: '#64748b'
  },
  pennyBlue: {
    primary: '#00a86b',
    primaryDark: '#007a4e',
    primaryLight: '#e1f5ee',
    surface: '#1e3a6e',
    surfaceSecondary: '#162f5a',
    surfaceTertiary: '#1f3864',
    textPrimary: '#e8f0fe',
    textSecondary: '#94a3b8',
    textTertiary: '#64748b',
    border: '#2d4a7a',
    borderStrong: '#3a5a8a',
    success: '#10b981',
    danger: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
    neutral: '#64748b'
  },
  dark: {
    primary: '#00a86b',
    primaryDark: '#007a4e',
    primaryLight: '#e1f5ee',
    surface: '#161b22',
    surfaceSecondary: '#1c2128',
    surfaceTertiary: '#0b0f14',
    textPrimary: '#e6edf3',
    textSecondary: '#8b949e',
    textTertiary: '#6e7681',
    border: '#2d333b',
    borderStrong: '#444c56',
    success: '#10b981',
    danger: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
    neutral: '#64748b'
  }
} satisfies Record<'light' | 'pennyBlue' | 'dark', ThemeTokens>;

export type ThemeName = keyof typeof THEME_TOKENS;
