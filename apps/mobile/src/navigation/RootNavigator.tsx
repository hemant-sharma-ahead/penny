import { NavigationContainer } from '@react-navigation/native';
import { AuthGuard } from './AuthGuard';
import { MainTabs } from './MainTabs';
import { ExpensesPage } from '../features/expenses/ExpensesPage';

// Temporary Track 4 wiring: real onboarding UI still doesn't exist, so "needs_onboarding" is currently
// the only reachable state. Renders whichever module was most recently ported (currently Expenses) in
// its place, superseding the previous stand-ins (Portfolio, Home, Accounts, Goals, IOU, Loans, Insurance,
// Subscriptions, ComponentGalleryScreen) — until the real onboarding stack lands. See
// docs/plans/mobile-migration.md's Track 4 progress log for each module ported so far.
//
// The Track C identity/auth prerequisite (claim/signedFetch/entitlement.native.ts/apiBase.native.ts
// worker URLs) was verified via two scratch tools, `CryptoSmokeTestScreen`/`ClaimSmokeTestScreen` in
// ../screens/ — both confirmed working end-to-end against the live penny-auth worker (see
// docs/plans/mobile-migration.md's Track C progress log entry) and are kept as reference/regression
// tools, temporarily swapped in here the same way, rather than wired in permanently. Groups (context +
// features/groups/* + restored Home/Expenses integration points) was verified the same way via a third
// scratch tool, `GroupsSmokeTestScreen` — claim → create/join a group → GroupDashboard/GroupMembersModal
// (invite link, expo-clipboard, native Share sheet) → SharedExpenseComposer → ExpenseForm's restored
// "Share with a group" toggle all confirmed working end-to-end against the live penny-groups worker (see
// docs/plans/mobile-migration.md's Groups progress log entry).
export function RootNavigator() {
  return (
    <NavigationContainer>
      <AuthGuard onNeedsOnboarding={() => <ExpensesPage />}>{() => <MainTabs />}</AuthGuard>
    </NavigationContainer>
  );
}
