import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SplashScreen } from '~/features/onboarding/SplashScreen';
import { PrivacyPromiseScreen } from '~/features/onboarding/PrivacyPromiseScreen';
import { PrivacyDemoScreen } from '~/features/onboarding/PrivacyDemoScreen';
import { ChipIntroScreen } from '~/features/onboarding/ChipIntroScreen';
import { SimulatedDashboardScreen } from '~/features/onboarding/SimulatedDashboardScreen';
import { LetUsKnowYouScreen } from '~/features/onboarding/LetUsKnowYouScreen';
import { SetupCredentialsScreen } from '~/features/onboarding/SetupCredentialsScreen';
import { AccountStartScreen } from '~/features/onboarding/AccountStartScreen';
import { AccountRecoveryScreen, type AccountTab } from '~/features/onboarding/AccountRecoveryScreen';
import { DemoVaultScreen } from '~/features/onboarding/DemoVaultScreen';
import { LifeHouseholdScreen } from '~/features/onboarding/LifeHouseholdScreen';
import { AddAccountsScreen } from '~/features/onboarding/AddAccountsScreen';
import { BackupSetupScreen } from '~/features/onboarding/BackupSetupScreen';

/**
 * Mobile's onboarding stack — one screen per apps/web-react/src/router/index.tsx's
 * `PATHS.onboarding.*` route (screen names below match those path keys, PascalCased), in the same
 * order. Web's `OnboardingLayout` wraps these routes with `OnboardingDraftProvider`; mobile mounts that
 * provider once at the `App.tsx` root instead (see that file), since there's no per-subtree route
 * grouping the way react-router has.
 */
export type OnboardingStackParamList = {
  Splash: undefined;
  PrivacyPromise: undefined;
  PrivacyDemo: undefined;
  ChipIntro: undefined;
  SimulatedDashboard: undefined;
  LetUsKnowYou: { fromDemoMode?: boolean } | undefined;
  SetupCredentials: undefined;
  Start: { fromDemoMode?: boolean } | undefined;
  Account: { tab?: AccountTab } | undefined;
  DemoVault: undefined;
  LifeHousehold: undefined;
  AddAccounts: undefined;
  BackupSetup: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Splash">
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="PrivacyPromise" component={PrivacyPromiseScreen} />
      <Stack.Screen name="PrivacyDemo" component={PrivacyDemoScreen} />
      <Stack.Screen name="ChipIntro" component={ChipIntroScreen} />
      <Stack.Screen name="SimulatedDashboard" component={SimulatedDashboardScreen} />
      <Stack.Screen name="LetUsKnowYou" component={LetUsKnowYouScreen} />
      <Stack.Screen name="SetupCredentials" component={SetupCredentialsScreen} />
      <Stack.Screen name="Start" component={AccountStartScreen} />
      <Stack.Screen name="Account" component={AccountRecoveryScreen} />
      <Stack.Screen name="DemoVault" component={DemoVaultScreen} />
      <Stack.Screen name="LifeHousehold" component={LifeHouseholdScreen} />
      <Stack.Screen name="AddAccounts" component={AddAccountsScreen} />
      <Stack.Screen name="BackupSetup" component={BackupSetupScreen} />
    </Stack.Navigator>
  );
}
