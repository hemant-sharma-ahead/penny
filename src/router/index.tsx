import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGuard } from './AuthGuard';
import { PATHS } from './paths';

import { SplashScreen } from '@/features/onboarding/SplashScreen';
import { PrivacyPromiseScreen } from '@/features/onboarding/PrivacyPromiseScreen';
import { SetupCredentialsScreen } from '@/features/onboarding/SetupCredentialsScreen';
import { PrivacyDemoScreen } from '@/features/onboarding/PrivacyDemoScreen';
import { ChipIntroScreen } from '@/features/onboarding/ChipIntroScreen';
import { SimulatedDashboardScreen } from '@/features/onboarding/SimulatedDashboardScreen';
import { HomePage } from '@/features/home/HomePage';
import { PortfolioPage } from '@/features/portfolio/PortfolioPage';
import { ExpensesPage } from '@/features/expenses/ExpensesPage';
import { GoalsPage } from '@/features/goals/GoalsPage';
import { InsurancePage } from '@/features/insurance/InsurancePage';
import { SubscriptionsPage } from '@/features/subscriptions/SubscriptionsPage';
import { ChipPage } from '@/features/chip/ChipPage';

export const router = createBrowserRouter([
  { index: true, element: <Navigate to={PATHS.onboarding.splash} replace /> },

  { path: PATHS.onboarding.splash, element: <SplashScreen /> },
  { path: PATHS.onboarding.privacyPromise, element: <PrivacyPromiseScreen /> },
  { path: PATHS.onboarding.setupCredentials, element: <SetupCredentialsScreen /> },
  { path: PATHS.onboarding.privacyDemo, element: <PrivacyDemoScreen /> },
  { path: PATHS.onboarding.chipIntro, element: <ChipIntroScreen /> },
  { path: PATHS.onboarding.simulatedDashboard, element: <SimulatedDashboardScreen /> },

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
          { path: PATHS.app.insurance, element: <InsurancePage /> },
          { path: PATHS.app.subscriptions, element: <SubscriptionsPage /> },
          { path: PATHS.app.chip, element: <ChipPage /> }
        ]
      }
    ]
  },

  { path: '*', element: <Navigate to={PATHS.onboarding.splash} replace /> }
]);
