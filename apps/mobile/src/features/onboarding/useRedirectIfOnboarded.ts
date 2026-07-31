import { useEffect, useState } from 'react';
import { isOnboardingComplete } from '@/core/crypto/securityManager';
import { notifyAuthShouldRecheck } from '~/navigation/authRecheckBus';

/**
 * Stray-navigation guard for the two onboarding screens that actually create or re-key a vault
 * (DemoVaultScreen, SetupCredentialsScreen) — mirrors web's `useRedirectIfOnboarded` exactly, with one
 * platform difference: web `navigate(PATHS.app.home, { replace: true })`s away; mobile has no such route
 * to jump to directly (MainTabs only renders once `AuthGuard` itself flips to `ready`), so this instead
 * calls `notifyAuthShouldRecheck()` — AuthGuard re-runs its own `isOnboardingComplete()` check and swaps
 * in `MainTabs` the same way it would after a real `initialize()` call (see `authRecheckBus.ts`).
 *
 * Re-running `initialize()` on top of an existing vault would layer a second one on and corrupt reads
 * (later code decrypts with whichever DMK is in memory, which won't match rows written under the other
 * vault) — this guard exists to prevent exactly that.
 *
 * Returns `true` while the check is in flight so the caller can hold off rendering its real content —
 * otherwise the real screen would flash before the redirect fires.
 */
export function useRedirectIfOnboarded(allow: boolean): boolean {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    isOnboardingComplete()
      .then((done) => {
        if (cancelled) return;
        if (done && !allow) {
          notifyAuthShouldRecheck();
          return;
        }
        setChecking(false);
      })
      .catch(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allow]);

  return checking;
}
