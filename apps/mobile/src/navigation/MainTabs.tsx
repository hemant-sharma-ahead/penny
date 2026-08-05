import { View, Pressable, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { ChipAvatar } from '../components/ui/ChipAvatar';
import { PrivacyModeSwitcher } from '../components/privacy/PrivacyModeSwitcher';
import { RemindersBell } from '../components/reminders/RemindersBell';
import { useThemeColors } from '../theme/useThemeColors';
import { useTheme } from '../theme/ThemeProvider';
import { usePrivacy } from '../context/PrivacyContext';
import { getPrivacyModeColors } from '@penny/core/theme/privacyModeColors';
import { useProfile } from '@/hooks/useProfile';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { HeaderBackProvider, useHeaderScreen } from './HeaderBackContext';
import { HomeStack } from './HomeStack';
import { PortfolioPage } from '../features/portfolio/PortfolioPage';
import { ExpensesStack } from './ExpensesStack';
import { GoalsPage } from '../features/goals/GoalsPage';
import { ChipPage } from '../features/chip/ChipPage';
import { ContextSwitcher } from '../features/groups/ContextSwitcher';
import { DemoModeBanner } from '../components/demo/DemoModeBanner';

/**
 * Bottom nav order per CLAUDE.md: Home · Portfolio · Chip (FAB, centred) · Expenses · Goals — matches
 * apps/web-react/src/components/layout/BottomNav.tsx's item order/icons/colors. All 5 tabs are always
 * shown — the module-visibility toggles that used to let Portfolio/Goals be hidden were removed
 * 2026-08-01 alongside the rest of Settings' "Modules" section (see the Calculators-relocation
 * ARCHITECTURE.md entry).
 *
 * **Chrome-persistence fix**: the persistent header (avatar/Settings shortcut, `PrivacyModeSwitcher`,
 * `RemindersBell`) now lives *here*, above `Tab.Navigator`, instead of being attached to
 * `MainNavigator`'s old `MainTabs` `Stack.Screen` options — moved for the same reason `DemoModeBanner`
 * already renders here: anything that must be visible across every screen in the authenticated app (not
 * just the 5 tab roots) has to be owned by this component, since
 * `MainNavigator` now only ever renders this one screen (`OnboardingFlow` aside). Only the Home and
 * Expenses tabs get their own nested `Stack.Navigator` (`HomeStack`/`ExpensesStack`) — they're the only
 * two that need to push further screens; Portfolio/Chip/Goals render their page directly, same as
 * before, since nothing currently pushes from them. See `HomeStack.tsx`'s doc comment for the full
 * rationale and the cross-tab navigation pattern this requires at a few call sites.
 */
const Tab = createBottomTabNavigator();

/**
 * 5 tab roots — `Home`'s own nested stack's initial screen is `HomeMain`; `Portfolio`/`Chip`/`Goals`
 * render directly (no nested stack); `Expenses`'s nested stack's initial screen is `ExpensesMain`. Any
 * other route name reached here is a pushed subscreen (inside `HomeStack` or `ExpensesStack`).
 */
const TAB_ROOT_ROUTES = new Set(['HomeMain', 'Portfolio', 'Chip', 'ExpensesMain', 'Goals']);

/**
 * Center-slot title per route — 2026-08-01 chrome consolidation: every screen used to render its own
 * title in a second header row below this one (via `PageHeader`'s `title`/`leading`, or a hand-rolled
 * equivalent); that row is gone now, this map is its single replacement. `HomeMain` isn't here —
 * Home's center slot renders `ContextSwitcher` instead of a title (see `HeaderCenter` below).
 */
const SCREEN_TITLES: Record<string, string> = {
  Portfolio: 'Portfolio',
  Chip: 'Chip',
  ExpensesMain: 'Expenses',
  Goals: 'Goals',
  Settings: 'Settings',
  Profile: 'Edit profile',
  SafeModeSettings: 'Safe Mode',
  ManageTags: 'Manage Tags',
  ChangePin: 'Change PIN',
  ChangePassphrase: 'Change Passphrase',
  Timeline: 'Timeline',
  Backup: 'Backup & Restore',
  Insurance: 'Insurance',
  Loans: 'Loans',
  Accounts: 'Accounts',
  Subscriptions: 'Subscriptions',
  Feedback: 'Contact & Feedback',
  CashFlow: 'Cash Flow',
  Tax: 'Tax Awareness',
  Import: 'Import expenses'
};

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

/**
 * Left side of the persistent header — 2026-07-31 chrome consolidation: replaces the old
 * hamburger-icon-as-Settings-shortcut + logo/wordmark pair with a single avatar (profile initial) that
 * is itself the Settings entry point. Shown only on the 5 tab roots; pushed screens show
 * `HeaderBackChevron` instead (see `HeaderLeft` below). Hidden entirely during a forced PIN reset.
 */
function HeaderAvatar({ onPress }: { onPress: () => void }) {
  const theme = useThemeColors();
  const { profile } = useProfile();
  const initial = (profile?.displayName?.trim() || '?').charAt(0).toUpperCase();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel="Settings"
      className="w-9 h-9 rounded-full items-center justify-center"
      style={{ backgroundColor: theme.primary }}
    >
      <Text className="text-white text-sm font-bold">{initial}</Text>
    </Pressable>
  );
}

/**
 * Back-chevron shown in place of the avatar whenever a pushed screen (inside `HomeStack`/
 * `ExpensesStack`) is on top — 2026-08-01 chrome consolidation, replaces every screen's own
 * `BackButton`/`PageHeader` `leading`. Calls whatever the focused screen registered via
 * `useRegisterHeaderScreen`/`useDefaultHeaderBack` (see `HeaderBackContext.tsx`) — never `MainTabs`' own
 * `navigation.goBack()`, which would pop `MainTabs` itself rather than the nested stack screen on top.
 */
function HeaderBackChevron({ backHandler }: { backHandler: (() => void) | null }) {
  const theme = useThemeColors();
  return (
    <Pressable
      onPress={() => backHandler?.()}
      hitSlop={8}
      accessibilityLabel="Back"
      className="w-9 h-9 items-center justify-center rounded-full"
    >
      <Icon name="ti-arrow-left" size={20} color={theme.textPrimary} />
    </Pressable>
  );
}

function HeaderLeft({
  hidden,
  isTabRoot,
  onAvatarPress,
  backHandler
}: {
  hidden: boolean;
  isTabRoot: boolean;
  onAvatarPress: () => void;
  backHandler: (() => void) | null;
}) {
  if (hidden) return <View style={{ width: 36 }} />;
  return isTabRoot ? <HeaderAvatar onPress={onAvatarPress} /> : <HeaderBackChevron backHandler={backHandler} />;
}

/** Home's "Personal ▾"/group-name switcher, or every other screen's plain title — 2026-08-01 chrome
 *  consolidation: this is the one place either is shown; Home no longer has a separate floating pill,
 *  and no screen renders its own title in a second header row underneath anymore. */
function HeaderCenter({ isHomeRoot, title }: { isHomeRoot: boolean; title: string | undefined }) {
  if (isHomeRoot) {
    return hasEntitlement('sync') ? <ContextSwitcher variant="inline" /> : null;
  }
  if (!title) return null;
  return (
    <Text className="text-base font-semibold text-primary" numberOfLines={1} style={{ maxWidth: 180 }}>
      {title}
    </Text>
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

/**
 * Thin wrapper so `HeaderBackProvider` is a genuine ancestor of everything that reads from it —
 * `MainTabsContent` (below) is the component that actually calls `useHeaderScreen()`, and every screen
 * inside `Tab.Navigator` calls `useRegisterHeaderScreen`. A component can never read its own Provider's
 * context (Provider only reaches *descendants*), so `useHeaderScreen()` cannot live in the same
 * function that renders `<HeaderBackProvider>` — found the hard way via a real crash on-device
 * ("useHeaderBackContext must be used within HeaderBackProvider", thrown from `MainTabs` itself) when
 * this was originally one component.
 */
export function MainTabs() {
  return (
    <HeaderBackProvider>
      <MainTabsContent />
    </HeaderBackProvider>
  );
}

function MainTabsContent() {
  const theme = useThemeColors();
  const { activePalette } = useTheme();
  const { mode } = usePrivacy();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  // Matches web's BottomNav.tsx (reads `var(--color-mode-header-bg, #ffffff)` from the CSS cascade) and
  // MainNavigator's old header logic — RN has no cascade, so both are read directly here now that this
  // component owns the whole persistent chrome (tab bar + header).
  const modeColors = getPrivacyModeColors(mode, activePalette);

  // Mirrors web's `AppShell.tsx` `pinResetForced` gate: while a forced PIN reset is in progress
  // (reached via SessionGate's "Forgot PIN?" after exhausting attempts), the persistent chrome must be
  // genuinely non-dismissible — otherwise a user could tap the settings button or switch tabs and leave
  // the flow unfinished. `ChangePinPage`'s own in-screen guards (`gestureEnabled`/`headerBackVisible` on
  // its stack screen, `BackHandler` for the Android back button) only cover its own stack; they can't
  // reach up into this component's header/tab-bar, which is why this needs its own check.
  //
  // Which screen is focused right now (and whether it's a forced PIN reset) — reported directly by that
  // screen via `useRegisterHeaderScreen`/`useDefaultHeaderBack` (see `HeaderBackContext.tsx`'s doc
  // comment for why deriving this from `navigation.getState()`/`useNavigationState()` here instead
  // doesn't reliably work — `pinResetForced` used to be the one field still read that broken way and
  // hit the identical bug, resolving to `true` on ordinary screens and hiding the avatar).
  const { name: activeRouteName, backHandler, pinResetForced } = useHeaderScreen();
  const isTabRoot = TAB_ROOT_ROUTES.has(activeRouteName);
  const isHomeRoot = activeRouteName === 'HomeMain';

  return (
    <View style={{ flex: 1 }}>
      {/*
       * Persistent header — was `MainNavigator`'s `MainTabs` `Stack.Screen` options; moved here so it
       * survives navigation into HomeStack/ExpensesStack the same way the tab bar below does. The
       * safe-area-extending trick (see the old MainNavigator.tsx comment this was ported from) still
       * applies: Android's edge-to-edge rendering draws behind the status bar, so the themed fill
       * extends upward by `insets.top` to avoid a black gap above it.
       *
       * **2026-08-01 chrome consolidation**: background is now `modeColors.bg` (the same background
       * every screen's own content already sits on), not `modeColors.headerBg` with an accent border
       * underneath — the header is meant to read as part of the screen, not a fixed bar drawn on top of
       * it. The center slot shows Home's "Personal ▾"/group switcher on Home, or the current screen's
       * title everywhere else (see `HeaderCenter`) — this is also now the *only* title any screen
       * renders; every pushed screen's own former title+back row (via `PageHeader`'s `title`/`leading`,
       * or a hand-rolled equivalent) was removed in favor of this one row.
       *
       * `DemoModeBanner` lives *inside* this block, directly below the header row, rather than as a
       * sibling above it — found 2026-08-05: as a sibling it had no `insets.top` of its own, so on a
       * real device (unlike the emulator) it sat right under the notch/status icons while the header
       * row below it added a second, independent `insets.top` gap — banner, dead space, header. Sharing
       * this block's single `paddingTop: insets.top` fixes that without touching the header row itself
       * (avatar/group-switcher/eye/bell all stay exactly where they are). See
       * docs/mockups/proposals/demo-mode-banner-v1.html for the before/after. Hidden on Settings, which
       * has its own relocated Exit Demo Mode entry instead.
       */}
      <View style={{ paddingTop: insets.top, backgroundColor: modeColors.bg }}>
        {/*
         * True centering via two equal `flex: 1` side containers, not `position: 'absolute'` +
         * matching left/right insets (tried first) — that measured correctly but rendered off-center
         * on-device only (web was fine): this project's global NativeWind/`react-native-css-interop`
         * JSX transform (every element goes through it, for the CSS-variable theming `ThemeProvider.tsx`
         * relies on) doesn't apply absolute positioning + inset styles the same way React DOM does on
         * web. Two `flex: 1` containers of guaranteed-equal width push whatever's between them into the
         * exact middle using plain flexbox math — no absolute positioning, no interop edge case. Left
         * and right content (`HeaderLeft`/`HeaderRight`) are unchanged, just each wrapped in one of the
         * two balancing containers.
         */}
        <View className="flex-row items-center px-3" style={{ height: 46 }}>
          <View style={{ flex: 1, alignItems: 'flex-start' }}>
            <HeaderLeft
              hidden={pinResetForced}
              isTabRoot={isTabRoot}
              backHandler={backHandler}
              onAvatarPress={() => navigation.navigate('MainTabs', { screen: 'Home', params: { screen: 'Settings' } })}
            />
          </View>
          <View style={{ flexShrink: 0 }}>
            <HeaderCenter isHomeRoot={isHomeRoot} title={SCREEN_TITLES[activeRouteName]} />
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <HeaderRight />
          </View>
        </View>
        {!pinResetForced && activeRouteName !== 'Settings' && <DemoModeBanner />}
      </View>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: ICON_COLORS[route.name],
          tabBarInactiveTintColor: theme.textTertiary,
          tabBarStyle: pinResetForced
            ? { display: 'none' }
            : {
                backgroundColor: modeColors.headerBg,
                borderTopWidth: 2,
                borderTopColor: modeColors.accent
              },
          tabBarIcon:
            route.name === 'Chip'
              ? () => <ChipAvatar size={30} />
              : ({ color }: { color: string }) => (
                  <Icon name={ICON_NAMES[route.name] ?? 'ti-circle'} size={22} color={color} />
                )
        })}
      >
        <Tab.Screen name="Home" component={HomeStack} />
        <Tab.Screen name="Portfolio" component={PortfolioPage} />
        {/* Chip renders as a distinct round ChipAvatar icon (via tabBarIcon above), matching web's FAB
            treatment in spirit. The elevated/floating circular button chrome BottomNav.tsx has is a
            cosmetic polish item (custom tabBarButton) deferred to Track 6 — not worth risking unverified
            touch-handling wiring for in this headless dev environment. `ChipPage` itself is the same
            rule-based insights dashboard web-react ships today — real conversational Chip stays Phase 2
            on both platforms. */}
        <Tab.Screen name="Chip" component={ChipPage} />
        <Tab.Screen name="Expenses" component={ExpensesStack} />
        <Tab.Screen name="Goals" component={GoalsPage} />
      </Tab.Navigator>
    </View>
  );
}
