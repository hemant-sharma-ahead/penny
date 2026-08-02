import type { ReactNode } from 'react';
import { View, Text } from 'react-native';

interface PageHeaderProps {
  /** Optional one-line subtitle (a total, count, or status line). */
  subtitle?: ReactNode;
  /** Optional right-aligned actions, e.g. add/import/export buttons. */
  actions?: ReactNode;
  /** Optional full-width content rendered below the subtitle/actions row (custom rows, stat groups). */
  children?: ReactNode;
  /** Layout-only extra classes on the outer container. */
  className?: string;
}

/**
 * Secondary, screen-specific content row — sits directly below `MainTabs`' global header, which now owns
 * the title/back-button row itself (2026-08-01 chrome consolidation: every screen used to render its own
 * title+back row here via `title`/`leading`, stacked under a second global header row above it; folding
 * the title into the global header removed that duplication). This component is now only for what's
 * genuinely screen-specific: a subtitle line, right-aligned actions, or free-form content — render
 * nothing at all if a screen has none of those.
 */
export function PageHeader({ subtitle, actions, children, className = '' }: PageHeaderProps) {
  return (
    <View className={`px-4 pt-3 pb-3 border-b border-theme ${className}`}>
      {(subtitle != null || actions) && (
        <View className="flex-row items-center justify-between gap-3">
          {subtitle != null && (
            <Text className="text-sm text-secondary flex-1 shrink" numberOfLines={1}>
              {subtitle}
            </Text>
          )}
          {actions && <View className="flex-row items-center gap-1 shrink-0">{actions}</View>}
        </View>
      )}
      {children}
    </View>
  );
}
