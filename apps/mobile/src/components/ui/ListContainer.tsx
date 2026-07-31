import type { ReactNode } from 'react';
import { Children, Fragment } from 'react';
import { View } from 'react-native';

interface ListContainerProps {
  children: ReactNode;
  /** Layout-only extra classes on the outer container. */
  className?: string;
}

/**
 * Bordered, rounded surface that hairline-divides its direct children — the standard wrapper for
 * grouped list rows (accounts, transactions, previews). Web does this with CSS `divide-y`; RN has no
 * equivalent, so this inserts a 1px border-top on every child after the first instead.
 */
export function ListContainer({ children, className = '' }: ListContainerProps) {
  const items = Children.toArray(children);
  return (
    <View className={`bg-surface border border-theme rounded-xl overflow-hidden ${className}`}>
      {items.map((child, i) => (
        <Fragment key={i}>{i > 0 ? <View className="border-t border-theme">{child}</View> : child}</Fragment>
      ))}
    </View>
  );
}
