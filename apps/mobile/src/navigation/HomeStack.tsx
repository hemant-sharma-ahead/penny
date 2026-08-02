import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { usePrivacy } from '../context/PrivacyContext';
import { getPrivacyModeColors } from '@penny/core/theme/privacyModeColors';
import { HomePage } from '../features/home/HomePage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { SafeModeSettingsPage } from '../features/settings/SafeModeSettingsPage';
import { ManageTagsPage } from '../features/settings/ManageTagsPage';
import { ChangePinPage } from '../features/security/ChangePinPage';
import { ChangePassphrasePage } from '../features/security/ChangePassphrasePage';
import { TimelinePage } from '../features/activity/TimelinePage';
import { BackupPage } from '../features/backup/BackupPage';
import { InsurancePage } from '../features/insurance/InsurancePage';
import { LoanScenariosPage } from '../features/loans/LoanScenariosPage';
import { AccountsPage } from '../features/accounts/AccountsPage';
import { SubscriptionsPage } from '../features/subscriptions/SubscriptionsPage';
import { FeedbackPage } from '../features/feedback/FeedbackPage';
import { CashFlowPage } from '../features/cashflow/CashFlowPage';
import { TaxAwarenessPage } from '../features/tax/TaxAwarenessPage';

/**
 * The Home tab's own navigation stack — Track: chrome-persistence fix. Previously all of these
 * screens (plus Insurance/Loans/IOU/Accounts/Subscriptions/CashFlow/News/Calculators/Tax/Settings/
 * Profile/etc.) were flat siblings of `MainTabs` in `MainNavigator`'s single `Stack.Navigator`, which
 * meant navigating to ANY of them unmounted the whole `MainTabs` (bottom tab bar + persistent header)
 * — a real structural gap vs. web's `AppShell`, which never unmounts header/bottom-nav for any page
 * (confirmed by reading `AppShell.tsx` + `apps/web-react/src/router/index.tsx`: every route is a child
 * of one layout wrapping a single `<Outlet/>`). Nesting a `Stack.Navigator` *inside* the Home tab (the
 * standard React Navigation pattern for this) means pushing any of these screens keeps `MainTabs`'
 * `Tab.Navigator` mounted throughout, so the tab bar (and the header, now owned by `MainTabs.tsx`
 * itself) stays visible exactly like web's chrome.
 *
 * Everything here is reachable from Home's own widgets (`GlanceHeader`/`AccountsStrip`/
 * `MoneyStatsCard`/`HomeGroupsCard`) or from Settings' own sub-navigation (which lives
 * here too, since Settings is reached via the global header's menu button, which always targets
 * `navigate('MainTabs', { screen: 'Home', params: { screen: 'Settings' } })` regardless of which tab
 * is currently active — switching to Home when opening Settings is standard, accepted behavior, same
 * as most tab-based apps). A few screens (`Accounts`, `CashFlow`, `ManageTags`) are also reachable from
 * the Expenses tab's own stack (`ExpensesStack.tsx`) via cross-tab nested navigation
 * (`navigate('Home', { screen: 'Accounts' })`) rather than being registered twice — React Navigation
 * resolves this correctly since `Home` is a sibling tab, not an ancestor (bubbling only reaches
 * ancestors, so a genuine cross-tab jump needs the explicit nested form).
 */
export type HomeStackParamList = {
  HomeMain: undefined;
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
  Accounts: undefined;
  Subscriptions: undefined;
  Feedback: undefined;
  CashFlow: undefined;
  Tax: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStack() {
  const { activePalette } = useTheme();
  const { mode } = usePrivacy();
  const modeColors = getPrivacyModeColors(mode, activePalette);
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: modeColors.bg } }}>
      <Stack.Screen name="HomeMain" component={HomePage} />
      <Stack.Screen name="Settings" component={SettingsPage} />
      <Stack.Screen name="Profile" component={ProfilePage} />
      <Stack.Screen name="SafeModeSettings" component={SafeModeSettingsPage} />
      <Stack.Screen name="ManageTags" component={ManageTagsPage} />
      <Stack.Screen
        name="ChangePin"
        component={ChangePinPage}
        options={({ route }) => ({
          gestureEnabled: !route.params?.forcedPinReset,
          headerBackVisible: !route.params?.forcedPinReset
        })}
      />
      <Stack.Screen name="ChangePassphrase" component={ChangePassphrasePage} />
      <Stack.Screen name="Timeline" component={TimelinePage} />
      <Stack.Screen name="Backup" component={BackupPage} />
      <Stack.Screen name="Insurance" component={InsurancePage} />
      <Stack.Screen name="Loans" component={LoanScenariosPage} />
      <Stack.Screen name="Accounts" component={AccountsPage} />
      <Stack.Screen name="Subscriptions" component={SubscriptionsPage} />
      <Stack.Screen name="Feedback" component={FeedbackPage} />
      <Stack.Screen name="CashFlow" component={CashFlowPage} />
      <Stack.Screen name="Tax" component={TaxAwarenessPage} />
    </Stack.Navigator>
  );
}
