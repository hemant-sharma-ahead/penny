import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGuard } from './AuthGuard';
import { PATHS } from './paths';

import { OnboardingLayout } from '@/features/onboarding/OnboardingLayout';
import { SplashScreen } from '@/features/onboarding/SplashScreen';
import { PrivacyPromiseScreen } from '@/features/onboarding/PrivacyPromiseScreen';
import { SetupCredentialsScreen } from '@/features/onboarding/SetupCredentialsScreen';
import { PrivacyDemoScreen } from '@/features/onboarding/PrivacyDemoScreen';
import { ChipIntroScreen } from '@/features/onboarding/ChipIntroScreen';
import { SimulatedDashboardScreen } from '@/features/onboarding/SimulatedDashboardScreen';
import { LetUsKnowYouScreen } from '@/features/onboarding/LetUsKnowYouScreen';
import { AccountStartScreen } from '@/features/onboarding/AccountStartScreen';
import { AccountRecoveryScreen } from '@/features/onboarding/AccountRecoveryScreen';
import { DemoVaultScreen } from '@/features/onboarding/DemoVaultScreen';
import { LifeHouseholdScreen } from '@/features/onboarding/LifeHouseholdScreen';
import { AddAccountsScreen } from '@/features/onboarding/AddAccountsScreen';
import { BackupSetupScreen } from '@/features/onboarding/BackupSetupScreen';
import { HomePage } from '@/features/home/HomePage';
import { PortfolioPage } from '@/features/portfolio/PortfolioPage';
import { ExpensesPage } from '@/features/expenses/ExpensesPage';
import { GoalsPage } from '@/features/goals/GoalsPage';
import { InsurancePage } from '@/features/insurance/InsurancePage';
import { SubscriptionsPage } from '@/features/subscriptions/SubscriptionsPage';
import { LoanScenariosPage } from '@/features/loans/LoanScenariosPage';
import { TaxAwarenessPage } from '@/features/tax/TaxAwarenessPage';
import { CashFlowPage } from '@/features/cashflow/CashFlowPage';
import { ChipPage } from '@/features/chip/ChipPage';
import { BackupPage } from '@/features/backup/BackupPage';
import { ImportPage } from '@/features/import/ImportPage';
import { AccountsPage } from '@/features/accounts/AccountsPage';
import { CalculatorsPage } from '@/features/calculators/CalculatorsPage';
import { ChangePinPage } from '@/features/security/ChangePinPage';
import { ChangePassphrasePage } from '@/features/security/ChangePassphrasePage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { SafeModeSettingsPage } from '@/features/settings/SafeModeSettingsPage';
import { TimelinePage } from '@/features/activity/TimelinePage';
import { NewsPage } from '@/features/news/NewsPage';
import { FeedbackPage } from '@/features/feedback/FeedbackPage';

export const router = createBrowserRouter([
  { index: true, element: <Navigate to={PATHS.onboarding.splash} replace /> },

  {
    element: <OnboardingLayout />,
    children: [
      { path: PATHS.onboarding.splash, element: <SplashScreen /> },
      { path: PATHS.onboarding.privacyPromise, element: <PrivacyPromiseScreen /> },
      { path: PATHS.onboarding.privacyDemo, element: <PrivacyDemoScreen /> },
      { path: PATHS.onboarding.chipIntro, element: <ChipIntroScreen /> },
      { path: PATHS.onboarding.simulatedDashboard, element: <SimulatedDashboardScreen /> },
      { path: PATHS.onboarding.letUsKnowYou, element: <LetUsKnowYouScreen /> },
      { path: PATHS.onboarding.setupCredentials, element: <SetupCredentialsScreen /> },
      { path: PATHS.onboarding.start, element: <AccountStartScreen /> },
      { path: PATHS.onboarding.account, element: <AccountRecoveryScreen /> },
      { path: PATHS.onboarding.demoVault, element: <DemoVaultScreen /> },
      { path: PATHS.onboarding.lifeHousehold, element: <LifeHouseholdScreen /> },
      { path: PATHS.onboarding.addAccounts, element: <AddAccountsScreen /> },
      { path: PATHS.onboarding.backupSetup, element: <BackupSetupScreen /> }
    ]
  },

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
          { path: PATHS.app.loans, element: <LoanScenariosPage /> },
          { path: PATHS.app.tax, element: <TaxAwarenessPage /> },
          { path: PATHS.app.cashflow, element: <CashFlowPage /> },
          { path: PATHS.app.chip, element: <ChipPage /> },
          { path: PATHS.app.backup, element: <BackupPage /> },
          { path: PATHS.app.import, element: <ImportPage /> },
          { path: PATHS.app.accounts, element: <AccountsPage /> },
          { path: PATHS.app.calculators, element: <CalculatorsPage /> },
          { path: PATHS.app.changePin, element: <ChangePinPage /> },
          { path: PATHS.app.changePassphrase, element: <ChangePassphrasePage /> },
          { path: PATHS.app.profile, element: <ProfilePage /> },
          { path: PATHS.app.settings, element: <SettingsPage /> },
          { path: PATHS.app.safeMode, element: <SafeModeSettingsPage /> },
          { path: PATHS.app.timeline, element: <TimelinePage /> },
          { path: PATHS.app.news, element: <NewsPage /> },
          { path: PATHS.app.feedback, element: <FeedbackPage /> }
        ]
      }
    ]
  },

  { path: '*', element: <Navigate to={PATHS.onboarding.splash} replace /> }
]);
