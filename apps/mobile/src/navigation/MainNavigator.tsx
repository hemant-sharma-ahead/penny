import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MainTabs } from './MainTabs';
import { OnboardingNavigator } from './OnboardingNavigator';
import { Icon } from '../components/Icon';
import { PennyWordmark } from '../components/ui/PennyLogo';
import { PrivacyModeSwitcher } from '../components/privacy/PrivacyModeSwitcher';
import { RemindersBell } from '../components/reminders/RemindersBell';
import { useThemeColors } from '../theme/useThemeColors';
import { useTheme } from '../theme/ThemeProvider';
import { usePrivacy } from '../context/PrivacyContext';
import { getPrivacyModeColors } from '@penny/core/theme/privacyModeColors';
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
 * `AppShell` header, the `MainTabs` screen itself gets a real persistent header: left side is a
 * settings-menu button + the `PennyWordmark` logo (matching web's header exactly), right side is
 * `PrivacyModeSwitcher` + `RemindersBell` (also ported from web) — since `MainTabs`' own
 * `Tab.Navigator` has `headerShown: false` on every tab, this stack-level header is the one place
 * that chrome can live across all four tabs.
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

function HeaderLeft({ onPress }: { onPress: () => void }) {
  const theme = useThemeColors();
  return (
    <View className="flex-row items-center gap-3">
      <Pressable onPress={onPress} hitSlop={8}>
        <Icon name="ti-menu-2" size={22} color={theme.textSecondary} />
      </Pressable>
      <PennyWordmark height={22} />
    </View>
  );
}

function HeaderRight() {
  return (
    <View className="flex-row items-center gap-1">
      <PrivacyModeSwitcher />
      <RemindersBell />
    </View>
  );
}

export function MainNavigator() {
  const theme = useThemeColors();
  const { activePalette } = useTheme();
  const { mode } = usePrivacy();
  const insets = useSafeAreaInsets();
  // Privacy-mode header/background tint, layered on top of the light/pennyBlue/dark theme — RN port of
  // web's `[data-privacy-mode=...]` CSS overrides (`--color-mode-accent`/`--color-mode-header-bg`/
  // `--color-mode-bg`, see apps/web-react/src/index.css and AppShell.tsx's header). Missing entirely
  // until this pass (found via the 2026-07-25 parity sweep) — the header used a flat theme-only
  // background regardless of Safe/Private/Open mode.
  const modeColors = getPrivacyModeColors(mode, activePalette);
  return (
    <Stack.Navigator
      screenOptions={{
        // `headerStyle` only supports `backgroundColor` on native-stack (no border props) — the 2px
        // accent bottom border web's header has needs `headerBackground` instead, a custom render
        // function placed behind the header content. Expo's mandatory Android edge-to-edge (content
        // draws behind the system status bar) meant this `View`, sized to just the header row, left the
        // raw black window background showing through above it — found via on-device screenshot review,
        // 2026-07-25. Extending `top` upward by the safe-area inset stretches the themed fill (and the
        // accent border, still anchored to the header's true bottom) all the way to the physical top of
        // the screen, under the status bar icons.
        headerBackground: () => (
          <View
            style={{
              position: 'absolute',
              top: -insets.top,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: modeColors.headerBg,
              borderBottomWidth: 2,
              borderBottomColor: modeColors.accent
            }}
          />
        ),
        headerTintColor: theme.textPrimary,
        contentStyle: { backgroundColor: modeColors.bg }
      }}
    >
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={({ navigation }) => ({
          headerTitle: '',
          headerLeft: () => <HeaderLeft onPress={() => navigation.navigate('Settings')} />,
          headerRight: () => <HeaderRight />
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
