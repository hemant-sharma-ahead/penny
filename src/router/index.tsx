import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGuard } from './AuthGuard';
import { PATHS } from './paths';

import { SplashScreen } from '@/features/onboarding/SplashScreen';
import { OnboardingPlaceholder } from '@/features/onboarding/OnboardingPlaceholder';
import { HomePage } from '@/features/home/HomePage';
import { PortfolioPage } from '@/features/portfolio/PortfolioPage';
import { ExpensesPage } from '@/features/expenses/ExpensesPage';
import { GoalsPage } from '@/features/goals/GoalsPage';
import { ChipPage } from '@/features/chip/ChipPage';

export const router = createBrowserRouter([
  // Redirect root to onboarding
  { index: true, element: <Navigate to={PATHS.onboarding.splash} replace /> },

  // Onboarding flow (pre-auth, no AppShell)
  { path: PATHS.onboarding.splash, element: <SplashScreen /> },
  {
    path: PATHS.onboarding.privacyPromise,
    element: (
      <OnboardingPlaceholder
        title="Your data stays on your device"
        subtitle="0 bytes to any server. 0 trackers. AES-256 encryption. 3 permitted external domains."
        nextPath={PATHS.onboarding.setupCredentials}
      />
    )
  },
  {
    path: PATHS.onboarding.setupCredentials,
    element: (
      <OnboardingPlaceholder
        title="Set up your vault"
        subtitle="Your passphrase never leaves this device."
        nextPath={PATHS.onboarding.privacyDemo}
      />
    )
  },
  {
    path: PATHS.onboarding.privacyDemo,
    element: (
      <OnboardingPlaceholder
        title="See encryption in action"
        subtitle="Type anything and watch it become ciphertext instantly."
        nextPath={PATHS.onboarding.chipIntro}
      />
    )
  },
  {
    path: PATHS.onboarding.chipIntro,
    element: (
      <OnboardingPlaceholder
        title="Meet Chip"
        subtitle="Your AI money coach. Context-aware. Always shows its reasoning."
        nextPath={PATHS.onboarding.simulatedDashboard}
      />
    )
  },
  {
    path: PATHS.onboarding.simulatedDashboard,
    element: (
      <OnboardingPlaceholder
        title="Here's a preview"
        subtitle="Sample data to show you what Penny looks like with real numbers."
        nextPath={PATHS.app.home}
        nextLabel="Set up my dashboard"
      />
    )
  },

  // App shell (protected)
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: PATHS.app.root, element: <Navigate to={PATHS.app.home} replace /> },
          { path: PATHS.app.home, element: <HomePage /> },
          { path: PATHS.app.portfolio, element: <PortfolioPage /> },
          { path: PATHS.app.expenses, element: <ExpensesPage /> },
          { path: PATHS.app.goals, element: <GoalsPage /> },
          { path: PATHS.app.chip, element: <ChipPage /> }
        ]
      }
    ]
  },

  // Catch-all
  { path: '*', element: <Navigate to={PATHS.app.home} replace /> }
]);
