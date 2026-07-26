import { useTheme } from './ThemeProvider';
import { usePrivacy } from '~/context/PrivacyContext';
import { getPrivacyModeColors } from '@penny/core/theme/privacyModeColors';

/**
 * The live `--color-mode-accent` web reads via CSS cascade (`[data-privacy-mode=...]` overrides in
 * index.css) — always one of the three privacy-mode accent colors (amber/violet/red for Safe/Private/
 * Open), never the literal `#6366f1` fallback in web's `var(--color-mode-accent, #6366f1)` (that
 * fallback is unreachable in practice since `data-privacy-mode` is always set). Mobile has no CSS
 * cascade, so Groups (the one area that reads this token) must call this hook directly instead of
 * hardcoding the fallback hex (found in the 2026-07-26 parity sweep: `ContextSwitcher`/`GroupDashboard`/
 * `SharedExpenseComposer`/`HomeGroupsCard` all hardcoded indigo, never reflecting theme or privacy mode).
 */
export function useModeAccentColor(): string {
  const { activePalette } = useTheme();
  const { mode } = usePrivacy();
  return getPrivacyModeColors(mode, activePalette).accent;
}
