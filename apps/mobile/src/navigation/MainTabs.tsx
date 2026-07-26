import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Icon } from '../components/Icon';
import { ChipAvatar } from '../components/ui/ChipAvatar';
import { useThemeColors } from '../theme/useThemeColors';
import { useTheme } from '../theme/ThemeProvider';
import { usePrivacy } from '../context/PrivacyContext';
import { getPrivacyModeColors } from '@penny/core/theme/privacyModeColors';
import { HomePage } from '../features/home/HomePage';
import { PortfolioPage } from '../features/portfolio/PortfolioPage';
import { ExpensesPage } from '../features/expenses/ExpensesPage';
import { GoalsPage } from '../features/goals/GoalsPage';
import { ChipPage } from '../features/chip/ChipPage';
import { ContextSwitcher } from '../features/groups/ContextSwitcher';
import { DemoModeBanner } from '../components/demo/DemoModeBanner';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { useSettings } from '../context/SettingsContext';

/**
 * Bottom nav order per CLAUDE.md: Home · Portfolio · Chip (FAB, centred) · Expenses · Goals — matches
 * apps/web-react/src/components/layout/BottomNav.tsx's item order/icons/colors. This is React
 * Navigation's tab bar standing in for that component (not a literal port). Module-visibility filtering
 * (`useSettings().modules`) now hides the Portfolio/Goals tabs the same way web's `BottomNav` does when
 * toggled off in Settings (found missing via the 2026-07-25 parity sweep — mobile always showed all 4
 * regardless of the toggle). `PrivacyModeSwitcher`/`RemindersBell` moved into `MainNavigator`'s
 * stack-level header instead (the actual chrome parity fix for web's `AppShell` header).
 *
 * Track 4 (Onboarding) update: Home/Portfolio/Expenses/Goals tabs now render their real ported pages
 * instead of `PlaceholderScreen` (all four shipped earlier in Track 4 — see
 * docs/plans/mobile-migration.md). Chip now renders the real (mock-insights, not LLM chat) `ChipPage` —
 * same scope as web-react today; full conversational Chip AI stays Phase 2 on both platforms.
 *
 * `ContextSwitcher` mounts above the tab navigator (same persistent-chrome position as web's `AppShell`,
 * which renders it between the header and `<Outlet />`), gated by the same `hasEntitlement('sync')`
 * check web uses — so it's visible across every tab, not per-screen. `DemoModeBanner` renders just above
 * it, so the visible order is: `MainNavigator`'s stack header → Demo Mode banner → context switcher →
 * tab content — per explicit user feedback (2026-07-25), placed here rather than above the header
 * (unlike web's `AppShell`, which puts it above the header) since that's where the user wants it.
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
  const { modules } = useSettings();
  const { activePalette } = useTheme();
  const { mode } = usePrivacy();
  // Matches web's BottomNav.tsx, which reads `var(--color-mode-header-bg, #ffffff)` from the CSS
  // cascade — RN has no cascade, so this must be read directly the same way MainNavigator's stack
  // header already does, instead of a flat theme.surface that never reacted to privacy mode (found via
  // the parity-sweep skill's chrome-component check).
  const tabBarBg = getPrivacyModeColors(mode, activePalette).headerBg;

  return (
    <View style={{ flex: 1 }}>
      <DemoModeBanner />
      {hasEntitlement('sync') && <ContextSwitcher />}
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: ICON_COLORS[route.name],
          tabBarInactiveTintColor: theme.textTertiary,
          tabBarStyle: { backgroundColor: tabBarBg, borderTopColor: theme.border },
          tabBarIcon:
            route.name === 'Chip'
              ? () => <ChipAvatar size={30} />
              : ({ color }: { color: string }) => (
                  <Icon name={ICON_NAMES[route.name] ?? 'ti-circle'} size={22} color={color} />
                )
        })}
      >
        <Tab.Screen name="Home" component={HomePage} />
        {/* `tabBarButton: () => null` hides the tab bar entry without unmounting the screen from the
            navigator — web's module-visibility toggle only hides the BottomNav item, the route stays
            reachable (e.g. Home's net-worth tap-through still calls `navigation.navigate('Portfolio')`
            regardless of the toggle), so removing the Tab.Screen entirely would break that instead of
            matching web's behavior. */}
        <Tab.Screen
          name="Portfolio"
          component={PortfolioPage}
          options={modules.portfolio ? undefined : { tabBarButton: () => null }}
        />
        {/* Chip renders as a distinct round ChipAvatar icon (via tabBarIcon above), matching web's FAB
            treatment in spirit. The elevated/floating circular button chrome BottomNav.tsx has is a
            cosmetic polish item (custom tabBarButton) deferred to Track 6 — not worth risking unverified
            touch-handling wiring for in this headless dev environment. `ChipPage` itself is the same
            rule-based insights dashboard web-react ships today — real conversational Chip stays Phase 2
            on both platforms. */}
        <Tab.Screen name="Chip" component={ChipPage} />
        <Tab.Screen name="Expenses" component={ExpensesPage} />
        <Tab.Screen
          name="Goals"
          component={GoalsPage}
          options={modules.goals ? undefined : { tabBarButton: () => null }}
        />
      </Tab.Navigator>
    </View>
  );
}
