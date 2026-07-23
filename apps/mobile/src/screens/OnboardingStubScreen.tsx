import { View, Text } from 'react-native';

/** Track 1 skeleton placeholder for the onboarding stack — real onboarding screens (splash, privacy
 * promise, setup, demo, etc. — mirroring apps/web-legacy/src/features/onboarding/) land in Track 4. */
export function OnboardingStubScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-surface-tertiary px-6">
      <Text className="text-text-primary text-xl font-semibold">Penny</Text>
      <Text className="text-text-secondary mt-2 text-center">
        Onboarding flow lands in Track 4 — this screen just proves the AuthGuard's "needs_onboarding" branch renders.
      </Text>
    </View>
  );
}
