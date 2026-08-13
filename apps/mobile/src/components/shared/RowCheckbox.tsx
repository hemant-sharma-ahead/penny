import { View } from 'react-native';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

interface RowCheckboxProps {
  checked: boolean;
  size?: number;
}

/**
 * Shared bulk-select row checkbox — extracted (2026-08-13, expense-import review redesign issue #2)
 * from `apps/mobile/src/features/import/review/CategoryTile.tsx`'s two identical inline checkbox call
 * sites, so this visual can't silently drift out of sync between them. The unselected state used to be
 * a barely-visible 1px `theme.border` outline over a transparent fill — indistinguishable from an
 * ordinary hairline divider, worse in Dark theme. Fixed to a heavier 1.75px `theme.borderStrong` border
 * plus a filled `theme.surfaceTertiary` background, so an unchecked box reads as a real, tappable
 * control at a glance. Selected state is unchanged (filled `theme.primary` + check icon).
 *
 * Bank Import's own identical inline checkboxes (`UnmatchedBucket.tsx`/`MatchedBucket.tsx`'s reassign
 * picker) are NOT touched by this change — deliberately out of scope to keep this PR's diff scoped to
 * Expense Import — but they're the obvious next adopter of this shared component in a future pass; see
 * docs/mockups/proposals/expense-import-review-redesign-v1.html's "Where each fix actually lives" legend.
 */
export function RowCheckbox({ checked, size = 16 }: RowCheckboxProps) {
  const theme = useThemeColors();
  return (
    <View
      className="rounded items-center justify-center border shrink-0"
      style={{
        width: size,
        height: size,
        borderWidth: checked ? 1 : 1.75,
        borderColor: checked ? theme.primary : theme.borderStrong,
        backgroundColor: checked ? theme.primary : theme.surfaceTertiary
      }}
    >
      {checked && <Icon name="ti-check" size={Math.round(size * 0.6)} color="#fff" />}
    </View>
  );
}
