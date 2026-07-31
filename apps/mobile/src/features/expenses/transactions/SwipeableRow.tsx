import { memo, useRef, type ReactNode } from 'react';
import { Pressable, View, Text } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Icon } from '~/components/Icon';

export interface SwipeAction {
  icon: string;
  label: string;
  onPress: () => void;
  /** Defaults to the row's own text-tertiary token if omitted. */
  color?: string;
}

interface Props {
  /** Revealed by swiping the row left — same semantics as web's `actions` (Copy/Delete etc). */
  actions: SwipeAction[];
  onTap: () => void;
  children: ReactNode;
  className?: string;
}

const ACTION_W = 72;

/**
 * Web's `SwipeableRow` hand-rolls drag detection on raw Pointer Events (no RN equivalent — unlike a
 * CSS-Grid-to-flex-wrap swap, there's nothing to translate line-by-line here). Per the migration
 * decision, this is a real rebuild on `react-native-gesture-handler`'s `Swipeable`.
 *
 * Picked `ReanimatedSwipeable` (the `/ReanimatedSwipeable` entrypoint) over the legacy `Swipeable`
 * export from the package root: this repo already ships `react-native-reanimated` (Home's MarketTicker
 * marquee runs on it), the reanimated-backed variant drives the reveal off the UI thread so it stays
 * smooth during a fling, and it's the actively maintained implementation upstream (plain `Swipeable`
 * is kept only for apps that can't take the Reanimated dependency, which doesn't apply here).
 *
 * Props map 1:1 onto web's: `actions`/`children` are unchanged in shape (web's `SwipeAction.onClick`
 * is renamed `onPress` to match RN's `Pressable` convention; `color` becomes optional since not every
 * caller needs a non-default tint). `onTap` still fires only on a true tap — `Swipeable` already
 * distinguishes a tap from a drag internally (its pan gesture has its own activation distance), so
 * unlike web there's no manual `moved`/threshold bookkeeping: a `Pressable` around `children` fires
 * `onPress`, and `Swipeable` only steals the gesture once a horizontal pan is detected.
 *
 * Web reveals actions on a *left* swipe: dragging the row left slides in a right-anchored action strip.
 * That's `renderRightActions` here (the actions live off the row's right edge, revealed as content
 * moves left) — `renderLeftActions` would be the mirror (swipe right), which this row never uses.
 */
export const SwipeableRow = memo(function SwipeableRow({ actions, onTap, children, className = '' }: Props) {
  const ref = useRef<SwipeableMethods>(null);
  const openW = actions.length * ACTION_W;

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={openW / 2}
      overshootRight={false}
      enabled={actions.length > 0}
      renderRightActions={() => (
        <View className="flex-row">
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={() => {
                a.onPress();
                ref.current?.close();
              }}
              accessibilityLabel={a.label}
              className="items-center justify-center gap-0.5"
              style={{ width: ACTION_W, backgroundColor: a.color }}
            >
              <Icon name={a.icon} size={18} color="#fff" />
              <Text className="text-[10px] font-medium text-white">{a.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    >
      <Pressable onPress={onTap} className={`w-full bg-surface-3 ${className}`}>
        {children}
      </Pressable>
    </ReanimatedSwipeable>
  );
});
