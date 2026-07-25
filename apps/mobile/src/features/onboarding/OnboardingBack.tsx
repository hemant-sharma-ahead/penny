import { Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { OnboardingStackParamList } from '~/navigation/OnboardingNavigator';

/** Top-left back affordance for onboarding screens. Navigates to the explicit previous step, same as
 *  web's `OnboardingBack` (an explicit `to` rather than a bare `goBack()`, since a couple of screens are
 *  reachable from more than one place and web is always explicit about where "back" lands). */
export function OnboardingBack({ to }: { to: keyof OnboardingStackParamList }) {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const theme = useThemeColors();
  return (
    <Pressable
      onPress={() => navigation.navigate(to as never)}
      accessibilityLabel="Go back"
      className="absolute top-5 left-5 z-10 w-9 h-9 items-center justify-center rounded-full"
    >
      <Icon name="ti-arrow-left" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}
