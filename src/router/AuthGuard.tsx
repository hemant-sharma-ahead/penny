import { Navigate, Outlet } from 'react-router-dom';
import { PATHS } from './paths';

export function AuthGuard() {
  // M1 skeleton: always passes through so we can see the tab layout.
  // Will be wired to the encrypted profile store in M4.
  const isOnboardingComplete = true;

  if (!isOnboardingComplete) {
    return <Navigate to={PATHS.onboarding.splash} replace />;
  }

  return <Outlet />;
}
