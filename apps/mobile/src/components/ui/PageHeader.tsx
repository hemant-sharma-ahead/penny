import type { ReactNode } from 'react';
import { View, Text } from 'react-native';

interface PageHeaderProps {
  /** Heading text (or node). Rendered as the page title. */
  title: ReactNode;
  /** Optional one-line subtitle below the title (e.g. a total or count). */
  subtitle?: ReactNode;
  /** Optional element rendered to the left of the title, e.g. a back button. */
  leading?: ReactNode;
  /** Optional right-aligned actions, e.g. add/import/export buttons. */
  actions?: ReactNode;
  /** Optional full-width content rendered below the title row (custom rows, stat groups). */
  children?: ReactNode;
  /** Layout-only extra classes on the outer container. */
  className?: string;
}

/**
 * Standard page header: px-4 pt-4 pb-3 block with a bottom border, a title, and optional leading
 * element, right-aligned actions, subtitle, and a full-width slot below the title row. Use at the top
 * of every ported screen (native-stack's own header covers the back button — this is the in-content
 * header web uses below it, kept for parity with the rest of the design system).
 */
export function PageHeader({ title, subtitle, leading, actions, children, className = '' }: PageHeaderProps) {
  return (
    <View className={`px-4 pt-4 pb-3 border-b border-theme ${className}`}>
      <View className="flex-row items-center gap-3">
        {leading}
        <View className="flex-1 shrink">
          <Text className="text-xl font-semibold text-primary">{title}</Text>
          {subtitle != null && <Text className="text-sm mt-0.5 text-secondary">{subtitle}</Text>}
        </View>
        {actions && <View className="flex-row items-center gap-1 shrink-0">{actions}</View>}
      </View>
      {children}
    </View>
  );
}
