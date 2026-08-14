import type { ReactNode } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

interface BucketCardProps {
  dotColor: string;
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * Bordered, independently-collapsible bucket card (extracted 2026-08-14 from `TransactionsStage.tsx`,
 * per manual-testing gap #2 — Accounts/Categories stages needed the exact same collapsible-section
 * pattern Transactions stage already had, instead of a second bespoke implementation). Same colored-dot
 * + title + count + chevron header convention used everywhere else on the import wizard's bucket-style
 * screens.
 */
export function BucketCard({ dotColor, title, count, expanded, onToggle, children }: BucketCardProps) {
  const theme = useThemeColors();
  return (
    <View className="rounded-xl overflow-hidden bg-surface border border-theme">
      <Pressable onPress={onToggle} className="flex-row items-center justify-between gap-2 p-3">
        <View className="flex-1 flex-row items-center gap-1.5">
          <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor }} />
          <Text className="text-sm font-semibold text-primary">{title}</Text>
          <View className="bg-surface-3 rounded-full px-1.5 py-0.5">
            <Text className="text-[10px] font-bold text-secondary">{count}</Text>
          </View>
        </View>
        <Icon name={expanded ? 'ti-chevron-up' : 'ti-chevron-down'} size={14} color={theme.textTertiary} />
      </Pressable>
      {expanded && <View className="border-t border-theme px-3 pb-3 pt-2 gap-2">{children}</View>}
    </View>
  );
}
