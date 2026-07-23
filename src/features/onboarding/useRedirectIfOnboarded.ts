import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isOnboardingComplete } from '@/core/crypto/securityManager';
import { PATHS } from '@/router/paths';

/**
 * Stray-navigation guard for the two onboarding screens that actually create or re-key a vault
 * (DemoVaultScreen, SetupCredentialsScreen). `/onboarding/*` has no auth gate — only `/app/*` does —
 * so an already-onboarded user (real vault or an active Demo Mode one) can land here via a stray
 * link, a typed URL, or the browser back button. Re-running `initialize()` on top of an existing
 * vault would layer a second one on and corrupt reads (later code decrypts with whichever DMK is in
 * memory, which won't match rows written under the other vault) — this is exactly the bug behind the
 * `OperationError` seen during Demo Mode testing.
 *
 * Redirects to `/app/home` once onboarding is already complete, unless `allow` is true (the one
 * legitimate exception: exiting Demo Mode, where "onboarding complete" is true for the *demo* vault
 * but the screen is still doing real work). Returns `true` while the check is in flight so the caller
 * can hold off rendering its real content — otherwise the real screen would flash before the redirect
 * fires.
 */
export function useRedirectIfOnboarded(allow: boolean): boolean {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    isOnboardingComplete()
      .then((done) => {
        if (cancelled) return;
        if (done && !allow) {
          navigate(PATHS.app.home, { replace: true });
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
  }, [allow, navigate]);

  return checking;
}
