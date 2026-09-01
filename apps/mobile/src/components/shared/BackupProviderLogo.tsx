import Svg, { Path } from 'react-native-svg';

/** Google's verified brand blue — also the background color for Drive-specific action buttons
 *  ("Back up now" while the Drive panel is expanded, "Restore from Drive"), the same
 *  "Continue with Google"-style convention users already recognize from sign-in screens. */
export const DRIVE_BLUE = '#4285F4';

/**
 * Real brand marks for the two cloud backup destinations (docs/mockups/proposals/
 * backup-icons-and-ipo-gmp-v1.html §1, tier (b) "Moderate"), following `BankLogo.tsx`'s exact
 * pattern — verified `viewBox`/`d` straight from Simple Icons' own published metadata rather than
 * invented, plugged into `IconBadge`'s existing `iconElement` prop.
 *
 * Google Drive is a flat single-color glyph (`#4285F4`) — Simple Icons has no real multi-color
 * green/yellow/blue triangle mark available as a redistributable flat SVG path, so this flat blue is
 * the real, verified substitute, not a simplification of a fuller mark that exists elsewhere.
 *
 * Apple is pure black (`#000000`) by Apple's own brand guidelines (they never publish a colored
 * mark) — invisible on a dark card background as a fixed literal, so `AppleLogo` takes an explicit
 * `dark` flag and swaps to white, mirroring Apple's own two officially-sanctioned variants (they ship
 * both for exactly this reason). Callers must key this off the active theme mode explicitly
 * (`activePalette === 'dark'`), never off a text-color token, so it can't silently drift if that
 * token's exact shade ever changes for unrelated reasons.
 */
export function DriveLogo({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.081 0 3.753-.02 3.742-.047-.005-.02-1.708-3.001-3.775-6.62l-3.76-6.574zm-4.76 1.73a789.828 789.861 0 0 0-3.63 6.319L0 15.868l1.89 3.298 1.885 3.297 3.62-6.335 3.618-6.33-1.88-3.287C8.1 4.704 7.255 3.22 7.25 3.214zm2.259 12.653-.203.348c-.114.198-.96 1.672-1.88 3.287a423.93 423.948 0 0 1-1.698 2.97c-.01.026 3.24.042 7.222.042h7.244l1.796-3.157c.992-1.734 1.85-3.23 1.906-3.323l.104-.167h-7.249z"
      />
    </Svg>
  );
}

export function AppleLogo({ size, dark }: { size: number; dark: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={dark ? '#fff' : '#000'}
        d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
      />
    </Svg>
  );
}
