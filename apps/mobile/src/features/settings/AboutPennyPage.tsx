import { View, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card, SectionLabel, PennyLogo } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { useDefaultHeaderBack } from '~/navigation/HeaderBackContext';
import { APP_VERSION } from '~/lib/appVersion';
import { WHATS_NEW } from './whatsNew';

/**
 * "About Penny" (docs/mockups/proposals/about-penny-v1.html) — Settings' least-frequently-tapped,
 * purely-reference row, appended after Discover Penny. Hero (real app icon + name + live version) →
 * mission statement (de-emphasized, no card) → "Our Privacy Promise" doorway → this version's
 * "What's new". Mobile-only by design — `apps/web-react` has no equivalent and, being frozen, needs
 * none (confirmed during the mockup review, same documented exception as `PennyLoader`/"Did You Know").
 *
 * The "Our Privacy Promise" row does NOT navigate to onboarding's own `PrivacyPromise` route
 * (`OnboardingNavigator` → `PrivacyPromiseScreen`) even though that screen covers the identical
 * content — that screen has no back button of its own (built to be reached only as the very first
 * onboarding screen, straight from `SplashScreen`), and its only interactive elements are an
 * agree-checkbox and an "I'm in — continue" button that pushes further into onboarding (`PrivacyDemo`).
 * Reaching it from inside the authenticated app via `navigate('OnboardingFlow', { screen:
 * 'PrivacyPromise' })` would strand an already-onboarded user with no way back to Settings. Instead this
 * links to `PrivacyPromisePage.tsx` — a new, `HomeStack`-registered read-only view sharing the exact
 * same pillars/mission content (`~/features/onboarding/privacyPillars.ts`, extracted from
 * `PrivacyPromiseScreen.tsx` so neither copy can drift) with a proper back button, minus the
 * onboarding-only CTA.
 */
export function AboutPennyPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  useDefaultHeaderBack('AboutPenny');

  const whatsNew = WHATS_NEW.find((entry) => entry.version === APP_VERSION) ?? WHATS_NEW[WHATS_NEW.length - 1];

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: modeBg }}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-4 pt-2 pb-6 gap-5">
          {/* Hero — `PennyLogo` is the app icon's own composition rendered as a scalable vector (see
           *  its doc comment + `SplashScreen.tsx`'s identical use), used here instead of a raster
           *  `assets/icon.png` require (which the mockup shows, but no src file in this codebase
           *  imports a static image asset that way — this is the established in-app equivalent). */}
          <View className="items-center pt-2">
            <PennyLogo size={68} />
            <Text className="text-lg font-bold text-primary mt-2.5">Penny</Text>
            <View className="mt-1.5 rounded-full border border-theme bg-surface-2 px-2.5 py-1">
              <Text className="text-[11px] font-bold text-tertiary">v{APP_VERSION}</Text>
            </View>
          </View>

          {/* Mission statement — verbatim, de-emphasized, no card */}
          <Text className="text-center text-sm text-secondary italic leading-relaxed px-2">
            &quot;We built Penny for people who want wealth tools without surveillance.&quot;
          </Text>

          {/* Our Privacy Promise — elevated, primary-filled, matching the destination screen's tone */}
          <Card onPress={() => navigation.navigate('PrivacyPromise')} className="flex-row items-center gap-3">
            <View
              className="w-[38px] h-[38px] rounded-xl items-center justify-center shrink-0"
              style={{ backgroundColor: theme.primary }}
            >
              <Icon name="ti-shield-check" size={18} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-primary">Our Privacy Promise</Text>
              <Text className="text-[11px] text-tertiary mt-0.5 leading-relaxed">
                0 bytes readable by us, 0 trackers, AES-256 on-device encryption — the 5 things we promise.
              </Text>
            </View>
            <Icon name="ti-chevron-right" size={16} color={theme.textTertiary} />
          </Card>

          {/* What's new — static, non-tappable rows for the current version, per whatsNew.ts */}
          <View>
            <SectionLabel>What&apos;s new in v{APP_VERSION}</SectionLabel>
            <View className="rounded-2xl border border-theme bg-surface overflow-hidden">
              {whatsNew.highlights.map((line, i) => (
                <View
                  key={line}
                  className={`flex-row items-start gap-2.5 px-3.5 py-2.5 ${i > 0 ? 'border-t border-theme' : ''}`}
                >
                  <Icon name="ti-sparkles" size={13} color={theme.primary} />
                  <Text className="flex-1 text-xs text-secondary leading-relaxed">{line}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
