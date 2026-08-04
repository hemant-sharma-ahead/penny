import { useTheme } from './ThemeProvider';
import { usePrivacy } from '~/context/PrivacyContext';
import { getPrivacyModeColors } from '@penny/core/theme/privacyModeColors';

/**
 * The page background for the active theme. Every screen's root container reads this hook directly and
 * applies it as its own background (RN has no CSS-cascade equivalent to set it once at a shell level),
 * instead of the static `bg-surface-tertiary`/`bg-surface-3` Tailwind class (found missing across ~22
 * screens via the 2026-07-25 parity re-sweep; see docs/plans/mobile-migration.md). As of 2026-07-31 this
 * is theme-only — it no longer varies by Privacy Mode (Safe/Private/Open used to each tint it
 * differently; that ambient tinting was removed by deliberate decision, see `getPrivacyModeColors`).
 */
export function useModeBackgroundColor(): string {
  const { activePalette } = useTheme();
  const { mode } = usePrivacy();
  return getPrivacyModeColors(mode, activePalette).bg;
}
