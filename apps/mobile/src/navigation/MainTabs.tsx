import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Icon } from '../components/Icon';
import { ChipAvatar } from '../components/ui/ChipAvatar';
import { useThemeColors } from '../theme/useThemeColors';
import { HomePage } from '../features/home/HomePage';
import { PortfolioPage } from '../features/portfolio/PortfolioPage';
import { ExpensesPage } from '../features/expenses/ExpensesPage';
import { GoalsPage } from '../features/goals/GoalsPage';
import { ChipPage } from '../features/chip/ChipPage';
import { ContextSwitcher } from '../features/groups/ContextSwitcher';
import { hasEntitlement } from '@/core/entitlement/entitlement';

/**
 * Bottom nav order per CLAUDE.md: Home · Portfolio · Chip (FAB, centred) · Expenses · Goals — matches
 * apps/web-legacy/src/components/layout/BottomNav.tsx's item order/icons/colors. This is React
 * Navigation's tab bar standing in for that component (not a literal port): BottomNav's other chrome —
 * module-visibility filtering (useSettings) — depends on context/features not ported yet, and lands
 * with its own feature in a later pass. `PrivacyModeSwitcher`/`RemindersBell` moved into `MainNavigator`'s
 * stack-level header instead (the actual chrome parity fix for web's `AppShell` header); `DemoModeBanner`
 * remains unported.
 *
 * Track 4 (Onboarding) update: Home/Portfolio/Expenses/Goals tabs now render their real ported pages
 * instead of `PlaceholderScreen` (all four shipped earlier in Track 4 — see
 * docs/plans/mobile-migration.md). Chip now renders the real (mock-insights, not LLM chat) `ChipPage` —
 * same scope as web-legacy today; full conversational Chip AI stays Phase 2 on both platforms.
 *
 * `ContextSwitcher` mounts above the tab navigator (same persistent-chrome position as web's `AppShell`,
 * which renders it between the header and `<Outlet />`), gated by the same `hasEntitlement('sync')`
 * check web uses — so it's visible across every tab, not per-screen.
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
    <View style={{ flex: 1 }}>
      {hasEntitlement('sync') && <ContextSwitcher />}
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: ICON_COLORS[route.name],
          tabBarInactiveTintColor: theme.textTertiary,
          tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
          tabBarIcon:
            route.name === 'Chip'
              ? () => <ChipAvatar size={30} />
              : ({ color }: { color: string }) => (
                  <Icon name={ICON_NAMES[route.name] ?? 'ti-circle'} size={22} color={color} />
                )
        })}
      >
        <Tab.Screen name="Home" component={HomePage} />
        <Tab.Screen name="Portfolio" component={PortfolioPage} />
        {/* Chip renders as a distinct round ChipAvatar icon (via tabBarIcon above), matching web's FAB
            treatment in spirit. The elevated/floating circular button chrome BottomNav.tsx has is a
            cosmetic polish item (custom tabBarButton) deferred to Track 6 — not worth risking unverified
            touch-handling wiring for in this headless dev environment. `ChipPage` itself is the same
            rule-based insights dashboard web-legacy ships today — real conversational Chip stays Phase 2
            on both platforms. */}
        <Tab.Screen name="Chip" component={ChipPage} />
        <Tab.Screen name="Expenses" component={ExpensesPage} />
        <Tab.Screen name="Goals" component={GoalsPage} />
      </Tab.Navigator>
    </View>
  );
}
