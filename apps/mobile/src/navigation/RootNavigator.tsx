import { NavigationContainer } from '@react-navigation/native';
import { SyncProvider } from '@/core/sync/SyncProvider';
import { AuthGuard } from './AuthGuard';
import { MainNavigator } from './MainNavigator';
import { OnboardingNavigator } from './OnboardingNavigator';
import { IdentityReconciler } from '../features/onboarding/IdentityReconciler';

/**
 * Real navigation stack (Track 4 — Onboarding). Supersedes the Track 4-in-progress placeholder that
 * rendered whichever module was most recently ported in place of a real onboarding UI (see git history
 * for that stand-in and its rationale) — `AuthGuard`'s `needs_onboarding` branch now renders the real
 * 13-screen `OnboardingNavigator`, and `ready` renders the real `MainTabs`, wrapped in
 * `IdentityReconciler` (post-restore handle reconciliation, mirroring
 * apps/web-legacy/src/router/AuthGuard.tsx's own `IdentityReconciler` wrapping) and `SyncProvider`
 * (the automatic backup engine, ported alongside `~/features/backup/` — mirrors web's `AppShell`
 * mounting it post-unlock; see `packages/core/src/core/sync/SyncProvider.native.tsx`).
 *
 * The Track C identity/auth prerequisite (claim/signedFetch/entitlement.native.ts/apiBase.native.ts
 * worker URLs) and Groups were both verified via scratch tools (`CryptoSmokeTestScreen`/
 * `ClaimSmokeTestScreen`/`GroupsSmokeTestScreen` in `../screens/`) before this real onboarding UI
 * existed — see docs/plans/mobile-migration.md's Track C and Groups progress log entries. Those scratch
 * tools are kept as reference/regression tools, not wired in here.
 */
export function RootNavigator() {
  return (
    <NavigationContainer>
      <AuthGuard onNeedsOnboarding={() => <OnboardingNavigator />}>
        {() => (
          <IdentityReconciler>
            <SyncProvider>
              <MainNavigator />
            </SyncProvider>
          </IdentityReconciler>
        )}
      </AuthGuard>
    </NavigationContainer>
  );
}
