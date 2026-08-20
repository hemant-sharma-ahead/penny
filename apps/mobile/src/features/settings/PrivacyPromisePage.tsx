import { View, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';
import { PRIVACY_MISSION_STATEMENT, PRIVACY_PILLARS } from '~/features/onboarding/privacyPillars';

/**
 * Read-only "Our Privacy Promise" reference, reached from Settings → About Penny
 * (`AboutPennyPage.tsx`). Renders the exact same mission statement + 5 pillars as onboarding's
 * `PrivacyPromiseScreen.tsx` (imported from the shared `~/features/onboarding/privacyPillars.ts`, not
 * duplicated), minus that screen's agree-checkbox + "I'm in — continue" CTA — those only make sense
 * during first-run onboarding.
 *
 * Deliberately a separate screen rather than navigating straight to onboarding's own `PrivacyPromise`
 * route: that screen lives in `OnboardingNavigator` (`headerShown: false`) and has no back button of its
 * own — it's built to be reached only as the very first screen after `SplashScreen`, with its sole
 * interactive elements being the agree-checkbox and a "continue" button that pushes deeper into
 * onboarding (`PrivacyDemo`). Navigating there from inside the authenticated app via
 * `navigate('OnboardingFlow', { screen: 'PrivacyPromise' })` would strand an already-onboarded user on a
 * screen with no way back to Settings — confirmed while implementing this screen; see
 * `AboutPennyPage.tsx`'s doc comment for the same note.
 */
export function PrivacyPromisePage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  useDefaultHeaderBack('PrivacyPromise');

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-4 pt-4 gap-3">
          <Text className="text-sm text-secondary text-center leading-relaxed mb-2">{PRIVACY_MISSION_STATEMENT}</Text>
          {PRIVACY_PILLARS.map((p) => (
            <View key={p.title} className="flex-row items-start gap-3 bg-surface-2 rounded-xl p-4 border border-theme">
              <View
                className="w-9 h-9 rounded-lg items-center justify-center shrink-0"
                style={{ backgroundColor: theme.primary }}
              >
                <Icon name={p.icon} size={18} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-medium text-primary">{p.title}</Text>
                <Text className="text-xs text-secondary mt-0.5 leading-relaxed">{p.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
