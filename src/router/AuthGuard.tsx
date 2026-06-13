import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { isOnboardingComplete, isPinRotationDue, isSessionValid } from '@/core/crypto/securityManager';
import { SessionGate } from '@/core/session/SessionGate';
import { PATHS } from './paths';

type CheckState = 'checking' | 'needs_onboarding' | 'ready';

export function AuthGuard() {
  const [state, setState] = useState<CheckState>('checking');
  const [rotationDue, setRotationDue] = useState(false);

  useEffect(() => {
    let cancelled = false;

    isOnboardingComplete()
      .then((onboarded) => {
        if (cancelled) return;
        if (!onboarded) {
          setState('needs_onboarding');
          return;
        }
        // Check rotation regardless of session validity — banner should show
        // after unlock even when the app opens in a locked state.
        return Promise.all([isSessionValid(), isPinRotationDue()]).then(([, due]) => {
          if (cancelled) return;
          setRotationDue(due);
          setState('ready');
        });
      })
      .catch(() => {
        if (!cancelled) setState('needs_onboarding');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-2 border-[#00a86b] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (state === 'needs_onboarding') {
    return <Navigate to={PATHS.onboarding.splash} replace />;
  }

  return (
    <SessionGate onNeedsOnboarding={() => setState('needs_onboarding')} showRotationBanner={rotationDue}>
      <Outlet />
    </SessionGate>
  );
}
