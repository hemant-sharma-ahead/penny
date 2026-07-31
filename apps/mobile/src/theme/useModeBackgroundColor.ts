import { useTheme } from './ThemeProvider';
import { usePrivacy } from '~/context/PrivacyContext';
import { getPrivacyModeColors } from '@penny/core/theme/privacyModeColors';

/**
 * The privacy-mode-tinted page background web gets for free via CSS cascade (`AppShell.tsx`'s `<main
 * style={{backgroundColor: 'var(--color-mode-bg)'}}>`, with page components left transparent to let it
 * show through). RN has no cascade equivalent — every screen is a fully opaque native view — so each
 * page-level root container must read this hook directly and apply it as its own background, instead of
 * the static `bg-surface-tertiary`/`bg-surface-3` Tailwind class (found missing across ~22 screens via
 * the 2026-07-25 parity re-sweep; see docs/plans/mobile-migration.md).
 */
export function useModeBackgroundColor(): string {
  const { activePalette } = useTheme();
  const { mode } = usePrivacy();
  return getPrivacyModeColors(mode, activePalette).bg;
}
