import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { View, useColorScheme as useSystemColorScheme } from 'react-native';
import { vars } from 'nativewind';
import { THEME_TOKENS, type ThemeName, type ThemeTokens } from '@penny/core/theme/tokens';

/** The 4 themes from docs/DESIGN_GUIDELINES.md. 'system' isn't a palette of its own — it resolves to
 * 'light' or 'dark' based on the OS appearance, same as apps/web-legacy's SettingsContext. */
export type ThemePreference = ThemeName | 'system';

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
  const [preference, setPreference] = useState<ThemePreference>('system');
  const systemScheme = useSystemColorScheme();
  const activePalette = resolvePalette(preference, systemScheme === 'dark');

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
