import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { View, Platform, useColorScheme as useSystemColorScheme } from 'react-native';
import { vars } from 'nativewind';
import { THEME_TOKENS, type ThemeName, type ThemeTokens } from '@penny/core/theme/tokens';
import { getItem, setItem } from '~/lib/storage';

/** The 2 selectable themes from docs/DESIGN_GUIDELINES.md (Light, Dark) — 'system' isn't a palette of
 * its own, it resolves to 'light' or 'dark' based on the OS appearance, same as apps/web-react's
 * SettingsContext. `ThemeName` (from shared core) still has a third member, `'pennyBlue'` — removed as a
 * selectable option 2026-07-31, but the palette data stays in shared core rather than being deleted
 * outright, since nothing forces it out of the type there. */
export type ThemePreference = Exclude<ThemeName, 'pennyBlue'> | 'system';

const THEME_PREFERENCE_KEY = 'penny_theme_preference';

async function loadThemePreference(): Promise<ThemePreference> {
  const raw = await getItem(THEME_PREFERENCE_KEY);
  // Penny Blue was a real, selectable theme before 2026-07-31 (removed) — migrate anyone who had it
  // persisted to Dark rather than silently falling back to System (which could visibly change their
  // theme on next launch in a way they didn't ask for).
  if (raw === 'pennyBlue') return 'dark';
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  return 'system';
}

function resolvePalette(preference: ThemePreference, systemIsDark: boolean): ThemeName {
  if (preference !== 'system') return preference;
  return systemIsDark ? 'dark' : 'light';
}

function toCssVars(tokens: ThemeTokens): Record<string, string> {
  return {
    '--color-primary': tokens.primary,
    '--color-primary-dark': tokens.primaryDark,
    '--color-primary-light': tokens.primaryLight,
    '--color-surface': tokens.surface,
    '--color-surface-secondary': tokens.surfaceSecondary,
    '--color-surface-tertiary': tokens.surfaceTertiary,
    '--color-text-primary': tokens.textPrimary,
    '--color-text-secondary': tokens.textSecondary,
    '--color-text-tertiary': tokens.textTertiary,
    '--color-border': tokens.border,
    '--color-border-strong': tokens.borderStrong,
    '--color-success': tokens.success,
    '--color-danger': tokens.danger,
    '--color-warning': tokens.warning,
    '--color-info': tokens.info,
    '--color-neutral': tokens.neutral
  };
}

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  activePalette: ThemeName;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const systemScheme = useSystemColorScheme();
  const activePalette = resolvePalette(preference, systemScheme === 'dark');

  // Hydrate the persisted preference once on mount — previously missing entirely (found via on-device
  // testing, 2026-07-25): every other setting in this app persists across restarts via AsyncStorage
  // (SettingsContext, PrivacyContext, etc.), but this one reset to 'system' on every cold launch, so a
  // deliberately-chosen theme silently reverted the moment the app was closed and reopened.
  useEffect(() => {
    let cancelled = false;
    void loadThemePreference().then((loaded) => {
      if (!cancelled) setPreferenceState(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    void setItem(THEME_PREFERENCE_KEY, next);
  };

  // Web only: `nativewind`'s `vars()` below sets these as an inline style on this component's own View,
  // which works for every normal descendant — but react-native-web's `Modal` (see
  // node_modules/react-native-web/dist/exports/Modal/ModalPortal.js) renders its children via
  // `ReactDOM.createPortal` into a `<div>` appended directly to `document.body`, entirely outside this
  // View's DOM subtree. CSS custom properties don't cross that boundary (they cascade through the real
  // DOM tree, not the React tree), so every `bg-surface`/`border-theme`/etc. class inside any Modal
  // resolved to nothing on web — found via on-device (well, on-web) testing, 2026-07-26: modals rendered
  // fully transparent, showing the page behind them through the "empty" card. Mirroring the same
  // variables onto `documentElement` keeps them in scope for portalled content too, since a portal div is
  // still inside `<html>` even though it's outside this component's React-rendered DOM subtree.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const cssVars = toCssVars(THEME_TOKENS[activePalette]);
    const root = document.documentElement;
    for (const [key, value] of Object.entries(cssVars)) {
      root.style.setProperty(key, value);
    }
  }, [activePalette]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, setPreference, activePalette }),
    [preference, activePalette]
  );

  return (
    <ThemeContext.Provider value={value}>
      <View
        style={[{ flex: 1 }, vars(toCssVars(THEME_TOKENS[activePalette]))]}
        className={activePalette === 'light' ? '' : 'dark'}
      >
        {children}
      </View>
    </ThemeContext.Provider>
  );
}
