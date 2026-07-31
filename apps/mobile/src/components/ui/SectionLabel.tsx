import type { ReactNode } from 'react';
import { Text } from 'react-native';

/**
 * Small uppercase label used to title a section between cards/lists.
 * Spacing is caller-controlled via `className` (defaults to `mb-2`); pass
 * e.g. `-mb-2` when the parent already provides a gap.
 */
export function SectionLabel({ children, className = 'mb-2' }: { children: ReactNode; className?: string }) {
  return <Text className={`text-xs font-semibold text-tertiary uppercase tracking-wide ${className}`}>{children}</Text>;
}
