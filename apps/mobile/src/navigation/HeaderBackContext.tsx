import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

type BackHandler = (() => void) | null;

interface HeaderScreen {
  /** The route name as used in `MainTabs.tsx`'s `TAB_ROOT_ROUTES`/`SCREEN_TITLES` — drives the global
   *  header's center title and left-slot (avatar vs. back-chevron). */
  name: string;
  backHandler: BackHandler;
  /** Hides the whole header-left slot AND the bottom tab bar — for a screen that genuinely has NOTHING
   *  safe to navigate away to right now, not just "no back handler for this one control". Originally
   *  `pinResetForced` (`true` only while `ChangePinPage` shows a forced PIN reset, its own `forced`
   *  flag) — renamed 2026-08-14 when the Import Progress screen's locked "Importing" sub-state became a
   *  second, unrelated consumer of this exact same mechanism (redesign §14 item 8: a live write loop the
   *  user must not be able to abandon via a tab switch either, not just the header back-chevron).
   *  Reported directly by whichever screen needs it, same as `name`/`backHandler` — see this file's top
   *  doc comment for why nothing here is derived from react-navigation's own nested-state APIs
   *  (`useNavigationState`/`navigation.getState()`) instead. An earlier version kept *this one flag* on
   *  the old `useNavigationState`-based `isForcedPinResetActive` walk, reasoning it was a rare, low-risk
   *  edge case not worth migrating — that was wrong: it hit the identical `CHILD_STATE`-vs-`route.state`
   *  staleness bug, resolved to `true` on real devices when no forced reset was active, and hid the
   *  avatar (rendered as an empty placeholder) on ordinary screens. */
  chromeLocked: boolean;
}

interface HeaderBackContextValue {
  screen: HeaderScreen;
  setScreen: (s: HeaderScreen) => void;
}

const DEFAULT_SCREEN: HeaderScreen = { name: 'HomeMain', backHandler: null, chromeLocked: false };

const HeaderBackContext = createContext<HeaderBackContextValue | null>(null);

/**
 * 2026-08-01 chrome consolidation: `MainTabs`' global header now renders the title/back-chevron for
 * every screen (replacing each screen's own `PageHeader` `title`/`leading`, or a hand-rolled
 * equivalent). Two problems this solves, both because `MainTabs` sits *above* `Tab.Navigator` as a
 * sibling of `HomeStack`/`ExpensesStack` and has no direct view into which nested screen is focused:
 *
 * 1. **Which back, and which stack.** `MainTabs`' own `navigation.goBack()` would pop `MainTabs`
 *    itself, not the nested stack screen actually on top — only a pushed screen's own
 *    `useNavigation()` reliably pops that screen.
 * 2. **Which screen is even focused, reliably.** The first version of this (2026-08-01, same day)
 *    tried deriving this by walking `navigation.getState()`/`useNavigationState()` from `MainTabs`
 *    itself — this looked right in early manual testing but broke on real devices: React Navigation
 *    keeps a private, more current cache of a nested navigator's state (`CHILD_STATE`, internal to
 *    `@react-navigation/core`, deliberately not part of the public `NavigationState` type) separately
 *    from the public `route.state` field on a *parent* screen whose `component` itself renders another
 *    navigator (exactly `MainTabs`' own shape) — `route.state` can permanently lag behind rather than
 *    just being briefly stale on first mount, confirmed via on-device logging (`activeRouteName` stuck
 *    at the outer `'MainTabs'` screen name, never resolving to the focused tab's own nested screen,
 *    even minutes and several tab-switches later). Fighting react-navigation's internals further wasn't
 *    worth it — this version has every screen (tab root *and* pushed) report its own identity directly
 *    via `useFocusEffect`, which every screen gets called on regardless of what nested-state caching
 *    react-navigation does internally, so there's no path for staleness at all.
 */
export function HeaderBackProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<HeaderScreen>(DEFAULT_SCREEN);
  return <HeaderBackContext.Provider value={{ screen, setScreen }}>{children}</HeaderBackContext.Provider>;
}

function useHeaderBackContext(): HeaderBackContextValue {
  const ctx = useContext(HeaderBackContext);
  if (!ctx) throw new Error('useHeaderBackContext must be used within HeaderBackProvider');
  return ctx;
}

/** Read by `MainTabs`' header — the identity + back handler of whichever screen is currently focused. */
export function useHeaderScreen(): HeaderScreen {
  return useHeaderBackContext().screen;
}

/**
 * Called by every screen (tab root or pushed) while focused, reporting its own route `name` — used
 * for the global header's title/avatar-vs-back-chevron — and its `backHandler` (`null` for tab roots,
 * since they show the avatar, not a back-chevron; also `null` for a screen that has nothing to go back
 * to right now, e.g. `ChangePinPage` during a forced reset, or the Import Progress screen while its
 * write loop is running). No cleanup-on-blur reset is needed: every screen re-registers on its own focus
 * (including a tab root regaining focus after a pushed screen pops away), so the context is always kept
 * current by whichever screen actually has focus right now.
 */
export function useRegisterHeaderScreen(name: string, backHandler: BackHandler = null, chromeLocked = false): void {
  const { setScreen } = useHeaderBackContext();
  useFocusEffect(
    useCallback(() => {
      setScreen({ name, backHandler, chromeLocked });
    }, [name, backHandler, chromeLocked, setScreen])
  );
}

/** Convenience for the common pushed-screen case — a plain `navigation.goBack()` on this screen's own
 *  stack, reported under its own route `name`. */
export function useDefaultHeaderBack(name: string): void {
  const navigation = useNavigation();
  useRegisterHeaderScreen(
    name,
    useCallback(() => navigation.goBack(), [navigation])
  );
}
