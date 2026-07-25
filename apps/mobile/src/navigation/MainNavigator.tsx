import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Pressable } from 'react-native';
import { MainTabs } from './MainTabs';
import { OnboardingNavigator } from './OnboardingNavigator';
import { Icon } from '../components/Icon';
import { useThemeColors } from '../theme/useThemeColors';
import { ProfilePage } from '../features/profile/ProfilePage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { SafeModeSettingsPage } from '../features/settings/SafeModeSettingsPage';
import { ManageTagsPage } from '../features/settings/ManageTagsPage';
import { ChangePinPage } from '../features/security/ChangePinPage';
import { ChangePassphrasePage } from '../features/security/ChangePassphrasePage';
import { TimelinePage } from '../features/activity/TimelinePage';
import { InsurancePage } from '../features/insurance/InsurancePage';
import { LoanScenariosPage } from '../features/loans/LoanScenariosPage';
import { IouPage } from '../features/iou/IouPage';
import { AccountsPage } from '../features/accounts/AccountsPage';
import { SubscriptionsPage } from '../features/subscriptions/SubscriptionsPage';
import { FeedbackPage } from '../features/feedback/FeedbackPage';
import { ImportPage } from '../features/import/ImportPage';
import { BackupPage } from '../features/backup/BackupPage';
import { CashFlowPage } from '../features/cashflow/CashFlowPage';
import { NewsPage } from '../features/news/NewsPage';
import { CalculatorsPage } from '../features/calculators/CalculatorsPage';
import { TaxAwarenessPage } from '../features/tax/TaxAwarenessPage';

/**
 * The `ready` (post-`AuthGuard`) navigator: `MainTabs` (the bottom-tab dashboard) as the root screen,
 * plus every screen `SettingsPage`/`ProfilePage`'s `navigation.navigate(...)` calls assume exists —
 * `Profile`, `SafeModeSettings`, `ManageTags`, `ChangePin`, `ChangePassphrase`, `Timeline` (all built in
 * this same pass, previously only reachable in theory) — pushed on top of it. Standing in for web's
 * `AppShell` header (a persistent settings/menu icon above every tab), the `MainTabs` screen itself gets
 * a header with a left-aligned settings button navigating to `Settings`, since `MainTabs`' own
 * `Tab.Navigator` has `headerShown: false` on every tab.
 *
 * Also pushed on top: `Insurance`, `Loans`, `IOU`, `Accounts`, `Subscriptions` — Track 4 modules that
 * were ported and on-device-verified in isolation but, until this pass, had no real route connecting
 * them to the rest of the app. Every pushed screen (all of the above) owns its own `PageHeader` with a
 * `leading={<BackButton />}` — see `~/components/shared/BackButton.tsx` — so `headerShown: false` here.
 *
 * `Backup` (web's Backup & Restore) is now the real `BackupPage` — `ProfilePage`'s "Set up backup"
 * button, previously pointed at a placeholder, needed no change since the route name didn't change.
 *
 * `OnboardingFlow` re-mounts the same `OnboardingNavigator` used pre-`AuthGuard`, reachable from
 * `SettingsPage`'s "Exit Demo Mode" flow: `wipeDemoData()` clears seeded data but deliberately leaves
 * `security`/`profile` intact (the user stays logged in), so this is a real *nested* navigation case
 * (`navigation.navigate('OnboardingFlow', { screen: 'LetUsKnowYou', params: { fromDemoMode: true } })`),
 * not an `AuthGuard` re-check — unlike a PIN/passphrase `'wiped'` result, which genuinely clears
 * `security`/`profile` and correctly goes through `notifyAuthShouldRecheck()` instead (see
 * `ChangePinPage.tsx`).
 */
export type MainStackParamList = {
  MainTabs: undefined;
  Settings: undefined;
  Profile: undefined;
  SafeModeSettings: undefined;
  ManageTags: undefined;
  ChangePin: { forcedPinReset?: boolean } | undefined;
  ChangePassphrase: undefined;
  Timeline: undefined;
  Backup: undefined;
  Insurance: undefined;
  Loans: undefined;
  IOU: undefined;
  Accounts: undefined;
  Subscriptions: undefined;
  Feedback: undefined;
  Import: undefined;
  CashFlow: undefined;
  News: undefined;
  Calculators: undefined;
  Tax: undefined;
  OnboardingFlow: { screen: string; params?: Record<string, unknown> } | undefined;
};

const Stack = createNativeStackNavigator<MainStackParamList>();

function SettingsButton({ onPress }: { onPress: () => void }) {
  const theme = useThemeColors();
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Icon name="ti-menu-2" size={22} color={theme.textSecondary} />
    </Pressable>
  );
}

export function MainNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={({ navigation }) => ({
          title: 'Penny',
          headerLeft: () => <SettingsButton onPress={() => navigation.navigate('Settings')} />
        })}
      />
      <Stack.Screen name="Settings" component={SettingsPage} options={{ headerShown: false }} />
      <Stack.Screen name="Profile" component={ProfilePage} options={{ headerShown: false }} />
      <Stack.Screen name="SafeModeSettings" component={SafeModeSettingsPage} options={{ headerShown: false }} />
      <Stack.Screen name="ManageTags" component={ManageTagsPage} options={{ headerShown: false }} />
      <Stack.Screen
        name="ChangePin"
        component={ChangePinPage}
        options={({ route }) => ({
          headerShown: false,
          gestureEnabled: !route.params?.forcedPinReset,
          headerBackVisible: !route.params?.forcedPinReset
        })}
      />
      <Stack.Screen name="ChangePassphrase" component={ChangePassphrasePage} options={{ headerShown: false }} />
      <Stack.Screen name="Timeline" component={TimelinePage} options={{ headerShown: false }} />
      <Stack.Screen name="Backup" component={BackupPage} options={{ headerShown: false }} />
      <Stack.Screen name="Insurance" component={InsurancePage} options={{ headerShown: false }} />
      <Stack.Screen name="Loans" component={LoanScenariosPage} options={{ headerShown: false }} />
      <Stack.Screen name="IOU" component={IouPage} options={{ headerShown: false }} />
      <Stack.Screen name="Accounts" component={AccountsPage} options={{ headerShown: false }} />
      <Stack.Screen name="Subscriptions" component={SubscriptionsPage} options={{ headerShown: false }} />
      <Stack.Screen name="Feedback" component={FeedbackPage} options={{ headerShown: false }} />
      <Stack.Screen name="Import" component={ImportPage} options={{ headerShown: false }} />
      <Stack.Screen name="CashFlow" component={CashFlowPage} options={{ headerShown: false }} />
      <Stack.Screen name="News" component={NewsPage} options={{ headerShown: false }} />
      <Stack.Screen name="Calculators" component={CalculatorsPage} options={{ headerShown: false }} />
      <Stack.Screen name="Tax" component={TaxAwarenessPage} options={{ headerShown: false }} />
      <Stack.Screen name="OnboardingFlow" component={OnboardingNavigator} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
