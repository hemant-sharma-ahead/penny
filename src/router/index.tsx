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
import { IouPage } from '@/features/iou/IouPage';
import { LoanScenariosPage } from '@/features/loans/LoanScenariosPage';
import { HealthScorePage } from '@/features/health/HealthScorePage';
import { TaxAwarenessPage } from '@/features/tax/TaxAwarenessPage';
import { CashFlowPage } from '@/features/cashflow/CashFlowPage';
import { ChipPage } from '@/features/chip/ChipPage';
import { BackupPage } from '@/features/backup/BackupPage';
import { ImportPage } from '@/features/import/ImportPage';

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
          { path: PATHS.app.iou, element: <IouPage /> },
          { path: PATHS.app.loans, element: <LoanScenariosPage /> },
          { path: PATHS.app.health, element: <HealthScorePage /> },
          { path: PATHS.app.tax, element: <TaxAwarenessPage /> },
          { path: PATHS.app.cashflow, element: <CashFlowPage /> },
          { path: PATHS.app.chip, element: <ChipPage /> },
          { path: PATHS.app.backup, element: <BackupPage /> },
          { path: PATHS.app.import, element: <ImportPage /> }
        ]
      }
    ]
  },

  { path: '*', element: <Navigate to={PATHS.onboarding.splash} replace /> }
]);
