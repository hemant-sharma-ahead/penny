import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Modal as RNModal, Pressable, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

/**
 * RN port of apps/web-legacy/src/context/ToastContext.tsx. Same API (`showToast`), same one-toast-
 * at-a-time/auto-dismiss behavior. The web version is a `fixed` bottom-anchored bar within the
 * `max-w-[430px]` layout; RN has no such wrapper, so this renders as an absolutely-positioned `View`
 * anchored to the bottom of whatever it's mounted under (the app root), offset by the safe-area inset
 * instead of `env(safe-area-inset-bottom)`.
 *
 * Wrapped in a transparent `Modal` (2026-07-25, found via the rendering-model parity re-sweep): web's
 * toast is `position: fixed` with a `zIndex` deliberately higher than `Modal.tsx`'s own stacking tiers —
 * same DOM stacking context, so a toast fired while a modal is open always renders on top. A plain
 * absolutely-positioned `View` here has no such guarantee: `components/ui/Modal.tsx` uses RN's own
 * `<Modal>`, which composites into a separate native layer that unconditionally renders above every
 * normal JS view regardless of mount order — so a toast fired from inside an open modal (e.g.
 * `JoinGroupModal`, `SharedExpenseComposer`) was silently hidden behind it. Rendering the toast in its own
 * transparent `Modal` puts it in that same native layer; multiple native modals stack in presentation
 * order (last-shown on top), so a toast fired after a modal is already open correctly appears above it.
 */

export interface ToastOptions {
  message: string;
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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const theme = useThemeColors();
  const insets = useSafeAreaInsets();

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

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

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <RNModal transparent visible animationType="none" statusBarTranslucent onRequestClose={dismiss}>
          <View
            className="absolute left-0 right-0 items-center px-4"
            style={{ bottom: insets.bottom + 64 }}
            pointerEvents="box-none"
          >
            <View
              className="flex-row items-center gap-3 w-full rounded-xl border shadow-lg px-4 py-3"
              style={{ backgroundColor: theme.surface, borderColor: theme.border }}
            >
              <Text className="flex-1 text-sm" style={{ color: theme.textPrimary }}>
                {toast.message}
              </Text>
              {toast.actionLabel && (
                <Pressable onPress={() => void handleAction()}>
                  <Text className="text-sm font-semibold" style={{ color: theme.primary }}>
                    {toast.actionLabel}
                  </Text>
                </Pressable>
              )}
              <Pressable onPress={dismiss} accessibilityLabel="Dismiss">
                <Icon name="ti-x" size={15} color={theme.textTertiary} />
              </Pressable>
            </View>
          </View>
        </RNModal>
      )}
    </ToastContext.Provider>
  );
}
