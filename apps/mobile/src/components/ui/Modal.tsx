import type { ReactNode, RefObject } from 'react';
import { Modal as RNModal, View, Pressable, ScrollView, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

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
              <View className="flex-row items-center justify-between px-5 pt-5">
                <Text className="text-base font-semibold text-primary">{title}</Text>
                <Pressable
                  onPress={onClose}
                  className="w-8 h-8 items-center justify-center rounded-lg"
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
