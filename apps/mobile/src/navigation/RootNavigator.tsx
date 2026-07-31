import { NavigationContainer } from '@react-navigation/native';
import { SyncProvider } from '@/core/sync/SyncProvider';
import { AuthGuard } from './AuthGuard';
import { MainNavigator } from './MainNavigator';
import { OnboardingNavigator } from './OnboardingNavigator';
import { IdentityReconciler } from '../features/onboarding/IdentityReconciler';
import { GroupProvider } from '../context/GroupContext';
import { SessionGate } from '../session/SessionGate';
import { navigationRef } from './navigationRef';

/**
 * Real navigation stack (Track 4 — Onboarding). Supersedes the Track 4-in-progress placeholder that
 * rendered whichever module was most recently ported in place of a real onboarding UI (see git history
 * for that stand-in and its rationale) — `AuthGuard`'s `needs_onboarding` branch now renders the real
 * 13-screen `OnboardingNavigator`, and `ready` renders the real `MainTabs`, wrapped in
 * `IdentityReconciler` (post-restore handle reconciliation, mirroring
 * apps/web-react/src/router/AuthGuard.tsx's own `IdentityReconciler` wrapping), `SyncProvider`
 * (the automatic backup engine, ported alongside `~/features/backup/` — mirrors web's `AppShell`
 * mounting it post-unlock; see `packages/core/src/core/sync/SyncProvider.native.tsx`), and now
 * `GroupProvider` too — moved here from `App.tsx` (2026-07-25), where it was mounted globally: a real
 * bug found via on-device testing, not a deliberate choice. `GroupProvider` reads the encrypted
 * `groups`/`profile` repos via `useRepository` on mount, which throws "Session locked — master key not
 * available" at every cold boot, before the user ever unlocks, since it sat above this `AuthGuard` gate
 * entirely. Web's `AppShell.tsx` — itself only reachable post-auth via its own router guard — mounts
 * `GroupProvider` the same way this now does; `App.tsx` mounting it unconditionally was the porting
 * mistake, not a difference from web's structure. **`SessionGate` (2026-07-25) is the real fix for the
 * root cause**, not just `GroupProvider`'s relocation: `AuthGuard`'s 'ready' state only means onboarding
 * is complete, never that the in-memory Data Master Key is actually loaded (it's wiped on every process
 * restart) — web's `AuthGuard` renders `SessionGate` for exactly this reason (see its own file), and
 * mobile's port had dropped it entirely, going straight to `MainNavigator` with no key on every cold
 * launch. `SessionGate` now wraps everything below it, gating on `keystore.isUnlocked()` before any of
 * `IdentityReconciler`/`SyncProvider`/`GroupProvider`/`MainNavigator` ever mount.
 *
 * The Track C identity/auth prerequisite (claim/signedFetch/entitlement.native.ts/apiBase.native.ts
 * worker URLs) and Groups were both verified via scratch tools (`CryptoSmokeTestScreen`/
 * `ClaimSmokeTestScreen`/`GroupsSmokeTestScreen` in `../screens/`) before this real onboarding UI
 * existed — see docs/plans/mobile-migration.md's Track C and Groups progress log entries. Those scratch
 * tools are kept as reference/regression tools, not wired in here.
 */
export function RootNavigator() {
  return (
    <NavigationContainer ref={navigationRef}>
      <AuthGuard onNeedsOnboarding={() => <OnboardingNavigator />}>
        {(rotationDue) => (
          <SessionGate showRotationBanner={rotationDue}>
            <IdentityReconciler>
              <SyncProvider>
                <GroupProvider>
                  <MainNavigator />
                </GroupProvider>
              </SyncProvider>
            </IdentityReconciler>
          </SessionGate>
        )}
      </AuthGuard>
    </NavigationContainer>
  );
}
