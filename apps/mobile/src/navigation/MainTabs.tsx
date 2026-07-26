import { View, Pressable } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { ChipAvatar } from '../components/ui/ChipAvatar';
import { PennyWordmark } from '../components/ui/PennyLogo';
import { PrivacyModeSwitcher } from '../components/privacy/PrivacyModeSwitcher';
import { RemindersBell } from '../components/reminders/RemindersBell';
import { useThemeColors } from '../theme/useThemeColors';
import { useTheme } from '../theme/ThemeProvider';
import { usePrivacy } from '../context/PrivacyContext';
import { getPrivacyModeColors } from '@penny/core/theme/privacyModeColors';
import { HomeStack } from './HomeStack';
import { PortfolioPage } from '../features/portfolio/PortfolioPage';
import { ExpensesStack } from './ExpensesStack';
import { GoalsPage } from '../features/goals/GoalsPage';
import { ChipPage } from '../features/chip/ChipPage';
import { ContextSwitcher } from '../features/groups/ContextSwitcher';
import { DemoModeBanner } from '../components/demo/DemoModeBanner';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { useSettings } from '../context/SettingsContext';

/**
 * Bottom nav order per CLAUDE.md: Home · Portfolio · Chip (FAB, centred) · Expenses · Goals — matches
 * apps/web-react/src/components/layout/BottomNav.tsx's item order/icons/colors. Module-visibility
 * filtering (`useSettings().modules`) hides the Portfolio/Goals tabs the same way web's `BottomNav`
 * does when toggled off in Settings.
 *
 * **Chrome-persistence fix**: the persistent header (logo, settings menu, `PrivacyModeSwitcher`,
 * `RemindersBell`) now lives *here*, above `Tab.Navigator`, instead of being attached to
 * `MainNavigator`'s old `MainTabs` `Stack.Screen` options — moved for the same reason
 * `DemoModeBanner`/`ContextSwitcher` already render here: anything that must be visible across every
 * screen in the authenticated app (not just the 5 tab roots) has to be owned by this component, since
 * `MainNavigator` now only ever renders this one screen (`OnboardingFlow` aside). Only the Home and
 * Expenses tabs get their own nested `Stack.Navigator` (`HomeStack`/`ExpensesStack`) — they're the only
 * two that need to push further screens; Portfolio/Chip/Goals render their page directly, same as
 * before, since nothing currently pushes from them. See `HomeStack.tsx`'s doc comment for the full
 * rationale and the cross-tab navigation pattern this requires at a few call sites.
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

function HeaderLeft({ onPress }: { onPress: () => void }) {
  const theme = useThemeColors();
  return (
    <View className="flex-row items-center gap-3">
      <Pressable onPress={onPress} hitSlop={8}>
        <Icon name="ti-menu-2" size={22} color={theme.textSecondary} />
      </Pressable>
      <PennyWordmark height={22} />
    </View>
  );
}

function HeaderRight() {
  return (
    <View className="flex-row items-center gap-1">
      <PrivacyModeSwitcher />
      <RemindersBell />
    </View>
  );
}

export function MainTabs() {
  const theme = useThemeColors();
  const { modules } = useSettings();
  const { activePalette } = useTheme();
  const { mode } = usePrivacy();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  // Matches web's BottomNav.tsx (reads `var(--color-mode-header-bg, #ffffff)` from the CSS cascade) and
  // MainNavigator's old header logic — RN has no cascade, so both are read directly here now that this
  // component owns the whole persistent chrome (tab bar + header).
  const modeColors = getPrivacyModeColors(mode, activePalette);

  return (
    <View style={{ flex: 1 }}>
      {/*
       * Persistent header — was `MainNavigator`'s `MainTabs` `Stack.Screen` options; moved here so it
       * survives navigation into HomeStack/ExpensesStack the same way the tab bar below does. The
       * `headerBackground`-style absolute fill + safe-area-extending trick (see the old MainNavigator.tsx
       * comment this was ported from) still applies: Android's edge-to-edge rendering draws behind the
       * status bar, so the themed fill extends upward by `insets.top` to avoid a black gap above it.
       */}
      <View style={{ paddingTop: insets.top, backgroundColor: modeColors.headerBg }}>
        <View
          className="flex-row items-center justify-between px-4"
          style={{ height: 44, borderBottomWidth: 2, borderBottomColor: modeColors.accent }}
        >
          <HeaderLeft
            onPress={() => navigation.navigate('MainTabs', { screen: 'Home', params: { screen: 'Settings' } })}
          />
          <HeaderRight />
        </View>
      </View>
      <DemoModeBanner />
      {hasEntitlement('sync') && <ContextSwitcher />}
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: ICON_COLORS[route.name],
          tabBarInactiveTintColor: theme.textTertiary,
          tabBarStyle: { backgroundColor: modeColors.headerBg, borderTopColor: theme.border },
          tabBarIcon:
            route.name === 'Chip'
              ? () => <ChipAvatar size={30} />
              : ({ color }: { color: string }) => (
                  <Icon name={ICON_NAMES[route.name] ?? 'ti-circle'} size={22} color={color} />
                )
        })}
      >
        <Tab.Screen name="Home" component={HomeStack} />
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
        <Tab.Screen name="Expenses" component={ExpensesStack} />
        <Tab.Screen
          name="Goals"
          component={GoalsPage}
          options={modules.goals ? undefined : { tabBarButton: () => null }}
        />
      </Tab.Navigator>
    </View>
  );
}
