import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { usePrivacy } from '../context/PrivacyContext';
import { getPrivacyModeColors } from '@penny/core/theme/privacyModeColors';
import { HomePage } from '../features/home/HomePage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { SafeModeSettingsPage } from '../features/settings/SafeModeSettingsPage';
import { ManageTagsPage } from '../features/settings/ManageTagsPage';
import { DiscoverTipsPage } from '../features/settings/DiscoverTipsPage';
import { AboutPennyPage } from '../features/settings/AboutPennyPage';
import { PrivacyPromisePage } from '../features/settings/PrivacyPromisePage';
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
import { BankImportPage } from '../features/bank-import/BankImportPage';
import { BankImportOverridesPage } from '../features/bank-import/BankImportOverridesPage';
import { BankCashWithdrawalCodesPage } from '../features/bank-import/BankCashWithdrawalCodesPage';
import { BankImportHistoryPage } from '../features/bank-import/BankImportHistoryPage';
import { CheckpointTimelinePage } from '../features/accounts/CheckpointTimelinePage';
import { CheckOpeningBalancePage } from '../features/accounts/CheckOpeningBalancePage';
import { FullLedgerPage } from '../features/accounts/FullLedgerPage';
import { SmsTrackingSettingsPage } from '../features/sms-tracking/SmsTrackingSettingsPage';
import { UnparsedMessagesPage } from '../features/sms-tracking/UnparsedMessagesPage';
import { SmsReviewPage } from '../features/sms-tracking/SmsReviewPage';
import { PossibleMatchPage } from '../features/sms-tracking/PossibleMatchPage';

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
  DiscoverTips: undefined;
  /** About Penny (docs/mockups/proposals/about-penny-v1.html) — reached from Settings' "Data &
   *  activity" card, last row. `PrivacyPromise` here is a distinct, read-only screen from onboarding's
   *  own `PrivacyPromise` route (`OnboardingStackParamList`, a separate navigator) — see
   *  `AboutPennyPage.tsx`'s doc comment for why they aren't the same screen. */
  AboutPenny: undefined;
  PrivacyPromise: undefined;
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
  /** Bank statement import (docs/plans/bank-statement-import.md) — scoped to one account, entered from
   *  that account's own row on the Accounts page (`AccountList.tsx`'s Import action). */
  BankImport: { accountId: string };
  /** Global normalization-override management screen (§9a) — reachable from the Accounts page header,
   *  not scoped to any one account (merchant memory spans every account). */
  BankImportOverrides: undefined;
  /** Global cash-withdrawal narration-code management screen (2026-08-05 transfer-marking work) —
   *  same "not scoped to any one account" reasoning as BankImportOverrides. */
  BankCashWithdrawalCodes: undefined;
  /** Import History (docs/plans/bank-balance-sync.md §5/§11a, plan §7 Stage 2) — reachable from the
   *  Accounts page header like the two screens above, but the underlying data
   *  (`Account.coveredStatementRanges`) is inherently per-account, so `accountId` is optional: absent
   *  from the header-icon entry point (the page shows its own account picker first), present for any
   *  future direct per-account entry point. */
  BankImportHistory: { accountId?: string } | undefined;
  /** The checkpoint-diff escape hatch (docs/plans/bank-balance-sync.md §7 Stage 4, mockup `bank-
   *  balance-sync-v2.html` Frame 4) — the full ledger-style timeline, reached from the account detail's
   *  transaction-list drill-in ("View full reconciliation table ›"). Handles both diagnostic
   *  signatures itself (branches its own rendering), so one route serves both of the mockup's Frame 4
   *  variants. */
  CheckpointTimeline: { accountId: string };
  /** The "check your opening balance" destination (mockup Frame 2b's second frame) — reached for a
   *  `'flat-from-start'` checkpoint mismatch OR a live-recomputed anchor-disagreement finding alike
   *  ("one status slot, two possible causes", §7 Stage 3's own note; `Account.anchorReference`, renamed
   *  from `anchorDisagreement` 2026-08-09). */
  CheckOpeningBalance: { accountId: string };
  /** The dense, row-by-row Statement ⟷ Expense reconciliation for a chosen date window
   *  (`docs/plans/bank-reconciliation-ledger.md`, Phase 1) — a second, deeper zoom level on top of
   *  `CheckpointTimeline`'s sparse checkpoint-only table, reached from that page's "View full ledger
   *  ›" action. */
  FullLedger: { accountId: string };
  /** SMS-Based Expense Auto-Tracking (docs/plans/sms-transaction-tracking.md), reached from Settings.
   *  `scanLocked` mirrors `ExpensesStack.tsx`'s `Import` screen's own `importLocked` param — set via
   *  `navigation.setParams` from `SmsTrackingSettingsPage.tsx` itself while a backfill scan is actually
   *  running, to disable the swipe-back gesture for that window (the header back-chevron is disabled
   *  separately, via `useRegisterHeaderScreen`'s own `chromeLocked`). */
  SmsTrackingSettings: { scanLocked?: boolean } | undefined;
  SmsUnparsedMessages: undefined;
  SmsReview: undefined;
  SmsPossibleMatch: { recordId: string };
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
      <Stack.Screen name="DiscoverTips" component={DiscoverTipsPage} />
      <Stack.Screen name="AboutPenny" component={AboutPennyPage} />
      <Stack.Screen name="PrivacyPromise" component={PrivacyPromisePage} />
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
      <Stack.Screen name="BankImport" component={BankImportPage} />
      <Stack.Screen name="BankImportOverrides" component={BankImportOverridesPage} />
      <Stack.Screen name="BankCashWithdrawalCodes" component={BankCashWithdrawalCodesPage} />
      <Stack.Screen name="BankImportHistory" component={BankImportHistoryPage} />
      <Stack.Screen name="CheckpointTimeline" component={CheckpointTimelinePage} />
      <Stack.Screen name="CheckOpeningBalance" component={CheckOpeningBalancePage} />
      <Stack.Screen name="FullLedger" component={FullLedgerPage} />
      <Stack.Screen
        name="SmsTrackingSettings"
        component={SmsTrackingSettingsPage}
        options={({ route }) => ({ gestureEnabled: !route.params?.scanLocked })}
      />
      <Stack.Screen name="SmsUnparsedMessages" component={UnparsedMessagesPage} />
      <Stack.Screen name="SmsReview" component={SmsReviewPage} />
      <Stack.Screen name="SmsPossibleMatch" component={PossibleMatchPage} />
    </Stack.Navigator>
  );
}
