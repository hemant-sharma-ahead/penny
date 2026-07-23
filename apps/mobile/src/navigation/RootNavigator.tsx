import { NavigationContainer } from '@react-navigation/native';
import { AuthGuard } from './AuthGuard';
import { MainTabs } from './MainTabs';
import { ComponentGalleryScreen } from '../screens/ComponentGalleryScreen';

// Temporary Track 3 wiring: real onboarding UI doesn't exist yet (Track 4), so "needs_onboarding" is
// currently the only reachable state. Shows the component gallery instead of an inert placeholder — a
// visual verification tool for every ported UI component — until Track 4 replaces this with the real
// onboarding stack.
export function RootNavigator() {
  return (
    <NavigationContainer>
      <AuthGuard onNeedsOnboarding={() => <ComponentGalleryScreen />}>{() => <MainTabs />}</AuthGuard>
    </NavigationContainer>
  );
}
