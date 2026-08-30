import { useEffect, type ReactNode, type RefObject } from 'react';
import { Modal as RNModal, View, Pressable, ScrollView, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { registerModalOpen, unregisterModalOpen } from '~/lib/modalStack';

interface ModalProps {
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** sm = narrower (pickers, confirm dialogs), md = default width */
  size?: 'sm' | 'md' | undefined;
  /** true → body scrolls inside the card instead of growing */
  scrollable?: boolean;
  /** Forwarded to the internal `ScrollView` when `scrollable` — lets a caller (e.g. `ExpenseForm`)
   *  scroll a specific field into view on validation error, matching web's `focusPanel()`. */
  scrollRef?: RefObject<ScrollView | null>;
  /** Fires once the native modal has actually finished presenting — the reliable point to focus an
   *  inner input (a plain `autoFocus` on a TextInput mounted before the modal's native window is
   *  visible is unreliable and often no-ops; see `ExpenseForm.tsx`'s description field). */
  onShow?: () => void;
}

/**
 * Centered modal — matches docs/DESIGN_GUIDELINES.md's non-negotiable "centered modals, never bottom
 * sheets" rule. Built on RN's own `Modal` (transparent, fade animation) + a full-screen dim backdrop and
 * a centered card, mirroring the web version's fixed-inset-with-56/72-top/bottom-gap layout (so the card
 * visually sits between the header and bottom nav, not covering them) rather than a native bottom sheet.
 * Web's z-index stacking tiers (nested/level 1-3) aren't needed here — RN's Modal already stacks above
 * everything by being a separate native layer; multiple open Modals stack in mount order automatically.
 */
export function Modal({
  onClose,
  title,
  children,
  footer,
  size = 'md',
  scrollable = false,
  scrollRef,
  onShow
}: ModalProps) {
  const theme = useThemeColors();
  const body = <View className="px-5 pt-5 pb-5 gap-4">{children}</View>;

  // Registers this real native Modal as "open" for the lifetime of the mount — read by
  // `~/context/ToastContext.tsx` (via `~/lib/modalStack.ts`) to decide whether a toast needs its own
  // native-Modal layer to stack above this one, or can render as a plain overlay. See that file's doc
  // comment for why this distinction matters on Android specifically.
  useEffect(() => {
    registerModalOpen();
    return unregisterModalOpen;
  }, []);

  return (
    <RNModal transparent animationType="fade" onRequestClose={onClose} onShow={onShow}>
      <View className="flex-1">
        <Pressable className="absolute inset-0 bg-black/50" onPress={onClose} accessibilityLabel="Close" />
        <View className="flex-1 items-center justify-center px-4" style={{ paddingTop: 56, paddingBottom: 72 }}>
          <View
            className={`w-full ${size === 'sm' ? 'max-w-sm' : 'max-w-[430px]'} bg-surface rounded-2xl border border-theme`}
            // `overflow: 'hidden'` (found + fixed 2026-08-11, on-device testing) — RN doesn't clip a
            // rounded `View`'s children to its own bounds by default the way web's `border-radius`
            // does; a non-`scrollable` caller whose content (title + stat row + banner + a
            // fixed-height inner list) exceeds `maxHeight` was visibly spilling past the card's
            // rounded corners onto the dark backdrop instead of being contained. Safe for every
            // existing caller — nothing in this app intentionally relies on a modal's own content
            // escaping its card bounds.
            style={{ maxHeight: '100%', overflow: 'hidden', boxShadow: '0px 0px 20px rgba(0, 0, 0, 0.2)' }}
          >
            {title !== undefined && (
              <View className="flex-row items-center justify-between gap-2 px-5 pt-5">
                {/* `flex-1` + `numberOfLines` (found 2026-08-30) — without a flex basis, a long title
                    (e.g. an employer name appended to a sheet title) has no bound and pushes the close
                    button along with it instead of wrapping/truncating, squeezing it toward — or
                    past — the card's own right edge. Truncating here is safe for every existing
                    caller: nothing relies on a multi-line title. */}
                <Text className="text-base font-semibold text-primary flex-1" numberOfLines={1}>
                  {title}
                </Text>
                <Pressable
                  onPress={onClose}
                  className="w-8 h-8 items-center justify-center rounded-lg shrink-0"
                  accessibilityLabel="Close"
                >
                  <Icon name="ti-x" size={18} color={theme.textTertiary} />
                </Pressable>
              </View>
            )}

            {scrollable ? <ScrollView ref={scrollRef}>{body}</ScrollView> : body}

            {footer !== undefined && <View className="px-5 pb-5 -mt-1 pt-4 border-t border-theme">{footer}</View>}
          </View>
        </View>
      </View>
    </RNModal>
  );
}
