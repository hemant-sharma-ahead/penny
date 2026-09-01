import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode
} from 'react';
import { Modal as RNModal, Pressable, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { Icon } from '~/components/Icon';
import { BANNER_DEFAULT_ICON, type BannerVariant } from '~/components/ui/Banner.constants';
import { tint, ink } from '~/lib/color';
import { useThemeColors } from '~/theme/useThemeColors';
import { navigationRef } from '~/navigation/navigationRef';
import { isAnyModalOpen, subscribeModalOpen } from '~/lib/modalStack';

/**
 * RN port of apps/web-react/src/context/ToastContext.tsx. Same API (`showToast`), same one-toast-
 * at-a-time/auto-dismiss behavior.
 *
 * **Top-anchored, not bottom** (2026-08-04 follow-up) — sits just below `MainTabs`' persistent header
 * (`insets.top + 46` is that header's own height, see `MainTabs.tsx`) rather than above the bottom tab
 * bar. Still wrapped in a transparent `Modal` (2026-07-25, found via the rendering-model parity
 * re-sweep): web's toast is `position: fixed` with a `zIndex` deliberately higher than `Modal.tsx`'s own
 * stacking tiers — same DOM stacking context, so a toast fired while a modal is open always renders on
 * top. A plain absolutely-positioned `View` here has no such guarantee: `components/ui/Modal.tsx` uses
 * RN's own `<Modal>`, which composites into a separate native layer that unconditionally renders above
 * every normal JS view regardless of mount order — so a toast fired from inside an open modal (e.g.
 * `JoinGroupModal`, `SharedExpenseComposer`) was silently hidden behind it. Rendering the toast in its
 * own transparent `Modal` puts it in that same native layer; multiple native modals stack in
 * presentation order (last-shown on top), so a toast fired after a modal is already open correctly
 * appears above it.
 *
 * **Variant-coloured, matching `Banner`** (same follow-up) — reuses `Banner`'s exact variant→icon map
 * (`BANNER_DEFAULT_ICON`) and its `tint()`/`ink()` colour-mixing convention, so a toast reads as the same
 * "info/warning/danger/success" visual language as every inline Banner elsewhere, not a separate flat
 * neutral style. Defaults to `'info'` when a caller doesn't pass one, so every pre-existing `showToast`
 * call site (none of which passed a variant before this) keeps working unchanged.
 *
 * **Solid card background** (2026-08-04 follow-up) — the card's fill uses `ink(color, theme.surface,
 * 14)` (an opaque mix into the theme's actual surface colour), not `tint()`'s translucent `rgba()`.
 * Unlike `Banner`, which always sits on the screen's own already-known background, a toast floats in
 * its own transparent `Modal` above arbitrary content (photos, gradient cards, other modals) — a
 * translucent fill there meant the toast's own text-contrast varied with whatever happened to be
 * underneath it at the time, sometimes unreadable. `border` stays a translucent `tint()` (a thin edge
 * blending with whatever's just outside the card is fine; it's the whole card's fill that needed to be
 * predictable).
 *
 * **Countdown progress bar** (same follow-up) — a thin bar under the message, animated from full to
 * empty over the real `durationMs` via `react-native-reanimated`'s `withTiming` (linear easing, so the
 * bar's drain rate always matches the actual remaining time, not just a decorative loop). Reset to full
 * and restarted whenever `toast.id` changes (a new `showToast` call, including one that replaces a
 * still-visible toast) — see the `useEffect` below.
 *
 * **Android back button/gesture no longer swallowed while a toast is showing** (2026-08-16 fix, real
 * user report: "blocks app navigation until it is dismissed"). A native `<Modal>` on Android always
 * intercepts the hardware back button/gesture exclusively while `visible` — this is inherent to how an
 * Android Dialog window receives input, not something `pointerEvents`/`onRequestClose` content choices
 * can opt out of; the underlying screen's own navigator never even sees the back-press while any Modal
 * (including this transparent one) is on screen. Since a toast is an ambient, auto-dismissing
 * notification — never something the user is expected to deliberately act on before continuing — a back
 * press must do BOTH in one motion: dismiss the toast AND perform the navigation the user actually
 * wanted, not just the former (previously requiring a second back-press to actually navigate).
 * `handleRequestClose` below does exactly that via `navigationRef` (React Navigation's documented
 * outside-any-navigator handle, already used by `SessionGate.tsx`), rather than only calling `dismiss`.
 *
 * **Forward taps to content behind the toast no longer blocked either** (2026-08-18 follow-up, real
 * user report: "toast blocks app interactivity"). The back-button fix above only ever addressed the
 * hardware-back case — a plain tap elsewhere on screen while a toast was showing was still silently
 * swallowed on Android, for the identical underlying reason: a native `<Modal>` there is backed by an
 * Android `Dialog`, and that Dialog's *window* intercepts every touch within its (full-screen) bounds
 * at the OS level before RN's own `pointerEvents="box-none"` logic ever runs — `pointerEvents` only
 * arbitrates which view *within* a single window's tree receives a touch, it has no say over whether a
 * touch reaches a window behind the front one at all. There's no prop that opts a Modal's window out of
 * this; it's inherent to how Android dispatches touches to Dialog-backed windows.
 *
 * The real Modal was only ever needed here for one reason — stacking above an *already-open* modal
 * (`~/components/ui/Modal.tsx`, itself also `Dialog`-backed) — so the fix is to only pay that "blocks
 * everything behind it" cost when that's actually true. `~/lib/modalStack.ts` is a tiny shared
 * open-modal counter that `ui/Modal.tsx` registers itself in on mount/unmount; when nothing else is
 * open, the toast renders as a plain absolutely-positioned `View` (a real sibling in the normal RN view
 * tree, not a separate native window) with a high `zIndex` instead of a `<Modal>` — taps at any point
 * outside the toast's own card then behave exactly like any other overlapping sibling views, i.e. they
 * reach whatever's underneath with zero interception, and the hardware back button reaches the screen's
 * own navigator directly (no `handleRequestClose` forwarding hack needed in that path at all). The
 * `<Modal>`-wrapped path is kept, unchanged, for the one case that still needs it.
 */

export interface ToastOptions {
  message: string;
  /** Matches `Banner`'s variant set exactly. Defaults to `'info'`. */
  variant?: BannerVariant;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  durationMs?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

/** Thin countdown bar, full → empty over `durationMs`, restarting whenever `toastId` changes. A local,
 *  one-shot "animate from full to empty on mount" component — `components/ui/ProgressBar.tsx`'s
 *  contract is a different shape (animates *toward* a given value as it changes over time), not this
 *  "already full, drain once" case, so this stays a small dedicated implementation rather than
 *  contorting that shared one. */
function ToastCountdown({ toastId, durationMs, color }: { toastId: number; durationMs: number; color: string }) {
  const progress = useSharedValue(1);

  useEffect(() => {
    progress.value = 1;
    progress.value = withTiming(0, { duration: durationMs, easing: Easing.linear });
  }, [toastId, durationMs, progress]);

  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  // Edge-to-edge and flush with the card's own bottom edge — reads as the card's bottom border
  // rather than a separate progress-bar widget sitting inside the padded content. The outer card
  // clips this to its own rounded corners via `overflow: hidden` (see ToastProvider below).
  return (
    <View
      pointerEvents="none"
      className="absolute left-0 right-0 bottom-0 h-[3px]"
      style={{ backgroundColor: tint(color, 15) }}
    >
      <Animated.View className="h-full" style={[{ backgroundColor: color }, barStyle]} />
    </View>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const theme = useThemeColors();
  const insets = useSafeAreaInsets();
  // Whether a real `~/components/ui/Modal.tsx` is currently open elsewhere — see this file's own
  // 2026-08-18 doc comment above for why that's the only case a toast still needs its own native
  // `<Modal>` layer at all.
  const anyOtherModalOpen = useSyncExternalStore(subscribeModalOpen, isAnyModalOpen, isAnyModalOpen);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  /** Fired by the Modal's `onRequestClose` (Android hardware back button/gesture) — see this file's own
   *  2026-08-16 doc comment above for why this must forward the back-navigation, not just dismiss. */
  const handleRequestClose = useCallback(() => {
    dismiss();
    if (navigationRef.isReady() && navigationRef.canGoBack()) {
      navigationRef.goBack();
    }
  }, [dismiss]);

  const showToast = useCallback((options: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    const id = Date.now();
    setToast({ id, ...options });
    timer.current = setTimeout(() => setToast(null), options.durationMs ?? 5000);
  }, []);

  async function handleAction() {
    const action = toast?.onAction;
    dismiss();
    if (action) await action();
  }

  const variant = toast?.variant ?? 'info';
  const color = theme[variant];
  const durationMs = toast?.durationMs ?? 5000;

  // Shared between both render paths below — only the wrapper (native `<Modal>` vs. plain `View`)
  // differs, not the card itself.
  const toastCard = toast && (
    <View
      className="absolute left-0 right-0 items-center px-4"
      // insets.top + 54 clears MainTabs' persistent header (see that file's own header-row height) the
      // same way the old bottom position cleared the tab bar — plus a small gap below it. zIndex only
      // matters on the no-Modal path below, but is harmless to always set.
      style={{ top: insets.top + 54, zIndex: 9999 }}
      pointerEvents="box-none"
    >
      <View
        className="w-full rounded-xl border shadow-lg overflow-hidden"
        style={{ backgroundColor: ink(color, theme.surface, 14), borderColor: tint(color, 30) }}
      >
        <View className="flex-row items-center gap-3 px-4 pt-3 pb-3.5">
          <Icon name={BANNER_DEFAULT_ICON[variant]} size={17} color={color} />
          <Text className="flex-1 text-sm" style={{ color: ink(color, theme.textPrimary) }}>
            {toast.message}
          </Text>
          {toast.actionLabel && (
            <Pressable onPress={() => void handleAction()}>
              <Text className="text-sm font-semibold" style={{ color }}>
                {toast.actionLabel}
              </Text>
            </Pressable>
          )}
          <Pressable onPress={dismiss} accessibilityLabel="Dismiss">
            <Icon name="ti-x" size={15} color={theme.textTertiary} />
          </Pressable>
        </View>
        <ToastCountdown toastId={toast.id} durationMs={durationMs} color={color} />
      </View>
    </View>
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast &&
        (anyOtherModalOpen ? (
          <RNModal transparent visible animationType="none" statusBarTranslucent onRequestClose={handleRequestClose}>
            {toastCard}
          </RNModal>
        ) : (
          // No other modal open — a plain sibling view, not a separate native window, so taps outside
          // the card reach whatever's underneath exactly like any other overlapping view, and the
          // hardware back button needs no forwarding hack (it never left the screen's own navigator).
          toastCard
        ))}
    </ToastContext.Provider>
  );
}
