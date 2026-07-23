import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { PlaceholderScreen } from '../screens/PlaceholderScreen';
import { Icon } from '../components/Icon';
import { ChipAvatar } from '../components/ui/ChipAvatar';
import { useThemeColors } from '../theme/useThemeColors';

/**
 * Bottom nav order per CLAUDE.md: Home · Portfolio · Chip (FAB, centred) · Expenses · Goals — matches
 * apps/web-legacy/src/components/layout/BottomNav.tsx's item order/icons/colors. This is React
 * Navigation's tab bar standing in for that component (not a literal port): BottomNav's other chrome —
 * module-visibility filtering (useSettings), PrivacyModeSwitcher, RemindersBell, DemoModeBanner,
 * ContextSwitcher, the entitlement-gated group switcher — all depend on context/features not ported
 * yet, and land with their own features in Track 4, not here.
 */
const Tab = createBottomTabNavigator();

const ICON_COLORS: Record<string, string> = {
  Home: '#00a86b',
  Portfolio: '#6366f1',
  Expenses: '#f59e0b',
  Goals: '#10b981'
};

const ICON_NAMES: Record<string, string> = {
  Home: 'ti-home',
  Portfolio: 'ti-chart-pie',
  Expenses: 'ti-wallet',
  Goals: 'ti-target'
};

export function MainTabs() {
  const theme = useThemeColors();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: ICON_COLORS[route.name],
        tabBarInactiveTintColor: theme.textTertiary,
        tabBarIcon:
          route.name === 'Chip'
            ? () => <ChipAvatar size={30} />
            : ({ color }: { color: string }) => (
                <Icon name={ICON_NAMES[route.name] ?? 'ti-circle'} size={22} color={color} />
              )
      })}
    >
      <Tab.Screen name="Home">{() => <PlaceholderScreen label="Home" />}</Tab.Screen>
      <Tab.Screen name="Portfolio">{() => <PlaceholderScreen label="Portfolio" />}</Tab.Screen>
      {/* Chip renders as a distinct round ChipAvatar icon (via tabBarIcon above), matching web's FAB
          treatment in spirit. The elevated/floating circular button chrome BottomNav.tsx has is a
          cosmetic polish item (custom tabBarButton) deferred to Track 6 — not worth risking unverified
          touch-handling wiring for in this headless dev environment. */}
      <Tab.Screen name="Chip">{() => <PlaceholderScreen label="Chip" />}</Tab.Screen>
      <Tab.Screen name="Expenses">{() => <PlaceholderScreen label="Expenses" />}</Tab.Screen>
      <Tab.Screen name="Goals">{() => <PlaceholderScreen label="Goals" />}</Tab.Screen>
    </Tab.Navigator>
  );
}
