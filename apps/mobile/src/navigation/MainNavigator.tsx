import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { usePrivacy } from '../context/PrivacyContext';
import { getPrivacyModeColors } from '@penny/core/theme/privacyModeColors';
import { MainTabs } from './MainTabs';
import { OnboardingNavigator } from './OnboardingNavigator';

/**
 * The `ready` (post-`AuthGuard`) navigator — **chrome-persistence fix**: this now only ever renders
 * two screens. `MainTabs` (the bottom-tab dashboard, which now owns its own persistent header +
 * `Tab.Navigator`, with `HomeStack`/`ExpensesStack` nested inside it for anything that needs to push
 * further screens — see `MainTabs.tsx`/`HomeStack.tsx` for the full rationale) and `OnboardingFlow`
 * (re-mounts the same `OnboardingNavigator` used pre-`AuthGuard`, reachable from `SettingsPage`'s "Exit
 * Demo Mode" flow — a real *nested* navigation case, not an `AuthGuard` re-check, since
 * `wipeDemoData()` deliberately leaves `security`/`profile` intact and the user stays logged in).
 *
 * Previously this stack also held 19 other screens (Settings, Profile, Insurance, Loans, etc.) as
 * flat siblings of `MainTabs` — meaning navigating to any of them unmounted the bottom tab bar and the
 * header entirely, a real structural gap versus web's `AppShell` (which never unmounts header/
 * bottom-nav for any page). Those screens now live nested inside `HomeStack`/`ExpensesStack` instead,
 * reached via `MainTabs`' `Tab.Navigator` so the tab bar/header stay mounted throughout.
 */
export type MainStackParamList = {
  // Accepts nested `{ screen, params }` so callers can drill into a tab's own stack from outside it
  // (e.g. `navigate('MainTabs', { screen: 'Home', params: { screen: 'Backup' } })`) — see
  // HomeStack.tsx's doc comment for why this cross-navigator form is needed at all.
  MainTabs: { screen: string; params?: Record<string, unknown> } | undefined;
  OnboardingFlow: { screen: string; params?: Record<string, unknown> } | undefined;
};

const Stack = createNativeStackNavigator<MainStackParamList>();

export function MainNavigator() {
  const { activePalette } = useTheme();
  const { mode } = usePrivacy();
  const modeColors = getPrivacyModeColors(mode, activePalette);
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: modeColors.bg } }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="OnboardingFlow" component={OnboardingNavigator} />
    </Stack.Navigator>
  );
}
