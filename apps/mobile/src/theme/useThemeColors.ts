import { THEME_TOKENS, type ThemeTokens } from '@penny/core/theme/tokens';
import { useTheme } from './ThemeProvider';

/**
 * Real hex values for the active theme — the RN equivalent of reading `var(--color-*)` in a web
 * component's inline style. Ported components use this instead of the `var(--color-primary)`-style
 * default prop values the web versions use, since RN's style engine needs actual color values.
 */
export function useThemeColors(): ThemeTokens {
  const { activePalette } = useTheme();
  return THEME_TOKENS[activePalette];
}
