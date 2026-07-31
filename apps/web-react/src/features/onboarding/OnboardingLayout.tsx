import { Outlet } from 'react-router-dom';
import { OnboardingDraftProvider } from '@/context/OnboardingDraftContext';

/** Wraps all /onboarding/* routes so the draft (name/username/DOB/employment) survives across screens. */
export function OnboardingLayout() {
  return (
    <OnboardingDraftProvider>
      <Outlet />
    </OnboardingDraftProvider>
  );
}
