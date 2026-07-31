import { Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

/** Inline back button for `PageHeader`'s `leading` slot on pushed (non-tab-root) main-app screens.
 *  Unlike `OnboardingBack` (absolute-positioned, full-bleed onboarding screens with an explicit `to`),
 *  this sits inline in the header row and just calls `goBack()` — every main-app push has exactly one
 *  place it came from. */
export function BackButton() {
  const navigation = useNavigation();
  const theme = useThemeColors();
  return (
    <Pressable
      onPress={() => navigation.goBack()}
      accessibilityLabel="Go back"
      hitSlop={8}
      className="w-9 h-9 items-center justify-center rounded-full -ml-2"
    >
      <Icon name="ti-arrow-left" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}
