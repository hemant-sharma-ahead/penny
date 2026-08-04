import { useTheme } from './ThemeProvider';
import { usePrivacy } from '~/context/PrivacyContext';
import { getPrivacyModeColors } from '@penny/core/theme/privacyModeColors';

/**
 * A theme-appropriate accent color for Groups' UI (`ContextSwitcher`/`GroupDashboard`/
 * `SharedExpenseComposer`/`HomeGroupsCard` — the one area that reads this token), read via this hook
 * instead of each hardcoding a fallback hex (found in the 2026-07-26 parity sweep: all four hardcoded
 * indigo, never reflecting theme). As of 2026-07-31 this is theme-only — it no longer varies by Privacy
 * Mode (that ambient tinting was removed by deliberate decision, see `getPrivacyModeColors`).
 */
export function useModeAccentColor(): string {
  const { activePalette } = useTheme();
  const { mode } = usePrivacy();
  return getPrivacyModeColors(mode, activePalette).accent;
}
