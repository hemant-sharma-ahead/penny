import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { PlaceholderScreen } from '../screens/PlaceholderScreen';

// Bottom nav order per CLAUDE.md: Home · Portfolio · Chip (FAB, centred) · Expenses · Goals.
// The Chip-as-centred-FAB treatment is a Track 3/4 concern (custom tabBar); a plain tab item stands
// in for it here so the 5-screen shape is provable in Track 1.
const Tab = createBottomTabNavigator();

export function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home">{() => <PlaceholderScreen label="Home" />}</Tab.Screen>
      <Tab.Screen name="Portfolio">{() => <PlaceholderScreen label="Portfolio" />}</Tab.Screen>
      <Tab.Screen name="Chip">{() => <PlaceholderScreen label="Chip" />}</Tab.Screen>
      <Tab.Screen name="Expenses">{() => <PlaceholderScreen label="Expenses" />}</Tab.Screen>
      <Tab.Screen name="Goals">{() => <PlaceholderScreen label="Goals" />}</Tab.Screen>
    </Tab.Navigator>
  );
}
