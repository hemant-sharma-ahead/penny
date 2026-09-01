import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View, Pressable } from 'react-native';

interface CardProps {
  children: ReactNode;
  /** Inner padding. xs=p-3, sm=p-3.5, md=p-4 (default), lg=p-5 */
  padding?: 'xs' | 'sm' | 'md' | 'lg';
  /** Corner radius. md=rounded-xl, lg=rounded-2xl (default) */
  radius?: 'md' | 'lg';
  /** Makes the card a tappable button */
  onPress?: () => void;
  /** Layout-only classes (flex, gap, overflow). No colours or spacing — those belong inside. */
  className?: string;
  /** Escape hatch for a per-edge style override (e.g. a colored left-edge accent stripe) that can't be
   *  expressed as a NativeWind class — merges on top of the className-generated style, same as RN's
   *  normal style precedence. Don't reach for this for anything a `className` could already express. */
  style?: StyleProp<ViewStyle>;
}

const PADDING = { xs: 'p-3', sm: 'p-3.5', md: 'p-4', lg: 'p-5' } as const;
const RADIUS = { md: 'rounded-xl', lg: 'rounded-2xl' } as const;

export function Card({ children, padding = 'md', radius = 'lg', onPress, className = '', style }: CardProps) {
  const base = `bg-surface border border-theme ${RADIUS[radius]} ${PADDING[padding]} ${className}`;

  if (onPress) {
    return (
      <Pressable onPress={onPress} className={base} style={style}>
        {children}
      </Pressable>
    );
  }

  return (
    <View className={base} style={style}>
      {children}
    </View>
  );
}
