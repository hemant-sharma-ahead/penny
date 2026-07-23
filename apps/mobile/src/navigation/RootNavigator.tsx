import { NavigationContainer } from '@react-navigation/native';
import { AuthGuard } from './AuthGuard';
import { MainTabs } from './MainTabs';
import { OnboardingStubScreen } from '../screens/OnboardingStubScreen';

export function RootNavigator() {
  return (
    <NavigationContainer>
      <AuthGuard onNeedsOnboarding={() => <OnboardingStubScreen />}>{() => <MainTabs />}</AuthGuard>
    </NavigationContainer>
  );
}
