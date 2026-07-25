import { SectionList, View, Text, Pressable } from 'react-native';
import { formatCurrency } from '@/lib/formatters';
import { useThemeColors } from '~/theme/useThemeColors';
import { Icon } from '~/components/Icon';
import type { Account, Expense, ExpenseCategory, Hashtag } from '@/core/db/types';
import { isHiddenInSafeMode, isTagHiddenInSafeMode } from '@/core/expenses/categoryGroups';
import { SwipeableRow, type SwipeAction } from './SwipeableRow';

interface TransactionsTabProps {
  grouped: { label: string; items: Expense[] }[];
  categoryMap: Map<string, ExpenseCategory>;
  accountMap: Map<string, Account>;
  hashtags: Hashtag[];
  shouldMask: (sensitive: boolean | undefined) => boolean;
  onEdit: (expense: Expense) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (expense: Expense) => void;
  /** Share-later (Track E): opens the group picker for an as-yet-unshared expense. */
  onShare?: ((expense: Expense) => void) | undefined;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

interface Section {
  title: string;
  data: Expense[];
}

/**
 * RN port of apps/web-legacy/src/features/expenses/transactions/TransactionsTab.tsx. Groups is now
 * ported — this restores web's `onShare`/`shareGroups`-driven "Share" swipe action and the
 * shared-with-group (`ti-users-group`) badge on a transaction's title, both previously dropped here.
 *
 * Rebuilt on `SectionList` (was a plain `View`+`.map()` inside a parent `ScrollView`) — a real, previously
 * unnoticed scaling bug found on-device: with a demo-sized dataset (~1,000 transactions), rendering every
 * row unvirtualized meant mounting ~1,000 `SwipeableRow`s (each a `react-native-gesture-handler` instance
 * with its own worklets) simultaneously, which crashed hard enough on-device to take down the whole
 * emulator process, not just the app. `SectionList` windows rendering to what's near the viewport, the
 * same fix web never needed (a browser's DOM has no equivalent per-row native gesture-recognizer cost).
 * `TransactionsSlice.tsx`'s wrapping `ScrollView` was removed — this owns its own scroll now.
 */
export function TransactionsTab({
  grouped,
  categoryMap,
  accountMap,
  hashtags,
  shouldMask,
  onEdit,
  onDelete,
  onDuplicate,
  onShare,
  selectMode = false,
  selectedIds,
  onToggleSelect
}: TransactionsTabProps) {
  const theme = useThemeColors();

  if (grouped.length === 0) {
    return (
      <View className="p-10 items-center">
        <Icon name="ti-wallet" size={44} color={theme.textTertiary} />
        <Text className="text-sm mt-3 text-tertiary">No transactions yet. Tap + to add one.</Text>
      </View>
    );
  }

  const sections: Section[] = grouped.map((g) => ({ title: g.label, data: g.items }));
  const firstSectionTitle = sections[0]?.title;
  const lastSectionTitle = sections[sections.length - 1]?.title;
  const lastSectionCount = grouped[grouped.length - 1]?.items.length ?? 0;

  return (
    <SectionList
      className="flex-1 bg-surface-3"
      contentContainerStyle={{ paddingBottom: 96 }}
      sections={sections}
      keyExtractor={(txn) => txn.id}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => {
        const isFirst = section.title === firstSectionTitle;
        return (
          <View className="relative pl-10 pr-4 pt-4 pb-1.5 bg-surface-3">
            <View
              className="absolute w-px"
              style={{ left: 20, top: isFirst ? '55%' : 0, bottom: 0, backgroundColor: theme.border }}
            />
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">{section.title}</Text>
          </View>
        );
      }}
      renderItem={({ item: txn, index, section }) => {
        const txnType = txn.type ?? 'expense';
        const cat = categoryMap.get(txn.categoryId);
        const accent =
          txnType === 'income' ? '#10b981' : txnType === 'transfer' ? '#3b82f6' : (cat?.color ?? '#6b7280');
        const icon =
          txnType === 'income'
            ? 'ti-arrow-up-circle'
            : txnType === 'transfer'
              ? 'ti-arrows-exchange'
              : (cat?.icon ?? 'ti-dots');
        const amountColor = txnType === 'income' ? theme.success : txnType === 'expense' ? theme.danger : theme.info;
        const prefix = txnType === 'income' ? '+' : txnType === 'transfer' ? '' : '-';
        const acc = txn.accountId ? accountMap.get(txn.accountId) : undefined;
        const catLabel =
          txnType === 'transfer' ? 'Transfer' : (cat?.name ?? (txnType === 'income' ? 'Income' : 'Uncategorized'));
        const subtitle = acc?.name ? `${catLabel} · ${acc.name}` : catLabel;
        const isSel = selectedIds?.has(txn.id) ?? false;
        const masked = shouldMask((cat && isHiddenInSafeMode(cat)) || isTagHiddenInSafeMode(txn.hashtags, hashtags));

        const body = (
          <>
            <View
              className="w-9 h-9 rounded-xl items-center justify-center shrink-0"
              style={{ backgroundColor: `${accent}1f` }}
            >
              <Icon name={icon} size={18} color={accent} />
            </View>
            <View className="flex-1 min-w-0">
              <View className="flex-row items-center">
                <Text className="text-sm font-semibold text-primary shrink" numberOfLines={1}>
                  {txn.description}
                </Text>
                {txn.receiptDataUrl && (
                  <View className="ml-1">
                    <Icon name="ti-paperclip" size={12} color={theme.textTertiary} />
                  </View>
                )}
                {(txn.shareWith?.length ?? 0) > 0 && (
                  <View className="ml-1">
                    <Icon name="ti-users-group" size={12} color={theme.primary} />
                  </View>
                )}
              </View>
              <View className="flex-row items-center mt-0.5">
                <Text className="text-[11.5px] text-tertiary" numberOfLines={1}>
                  {subtitle}
                </Text>
                {txn.hashtags.map((tag) => (
                  <Text key={tag} className="ml-1.5 text-[11.5px] font-medium" style={{ color: theme.primary }}>
                    #{tag}
                  </Text>
                ))}
              </View>
            </View>
            <Text
              className="text-sm font-bold ml-2 shrink-0"
              style={{ color: masked ? theme.textPrimary : amountColor }}
            >
              {masked ? '••••' : `${prefix}${formatCurrency(txn.amount)}`}
            </Text>
          </>
        );

        // Select mode: flat tappable row with a checkbox; no rail.
        if (selectMode) {
          return (
            <Pressable
              onPress={() => onToggleSelect?.(txn.id)}
              className="w-full flex-row items-center gap-3 px-4 py-3"
              style={isSel ? { backgroundColor: theme.surfaceSecondary } : undefined}
            >
              <Icon
                name={isSel ? 'ti-circle-check-filled' : 'ti-circle'}
                size={20}
                color={isSel ? theme.primary : theme.textTertiary}
              />
              {body}
            </Pressable>
          );
        }

        // Normal mode: timeline rail + dot live INSIDE the row; swipe-left → Copy/Delete; tap → edit.
        const isLastRowOverall = section.title === lastSectionTitle && index === lastSectionCount - 1;
        const isShared = (txn.shareWith?.length ?? 0) > 0;
        const actions: SwipeAction[] = [
          ...(onDuplicate
            ? [{ icon: 'ti-copy', label: 'Copy', color: theme.info, onPress: () => onDuplicate(txn) }]
            : []),
          ...(onShare && txnType === 'expense' && !isShared
            ? [{ icon: 'ti-users-group', label: 'Share', color: theme.primary, onPress: () => onShare(txn) }]
            : []),
          ...(onDelete
            ? [{ icon: 'ti-trash', label: 'Delete', color: theme.danger, onPress: () => onDelete(txn.id) }]
            : [])
        ];
        return (
          <SwipeableRow actions={actions} onTap={() => onEdit(txn)}>
            <View
              className="relative w-full flex-row items-center gap-3 pl-10 pr-4 py-3"
              style={isShared ? { backgroundColor: `${theme.primary}0f` } : undefined}
            >
              {/* rail segment for this row */}
              <View
                className="absolute w-px"
                style={{ left: 20, top: 0, bottom: isLastRowOverall ? '50%' : 0, backgroundColor: theme.border }}
              />
              {/* dot on the rail */}
              <View
                className="absolute w-2.5 h-2.5 rounded-full"
                style={{ left: 15, top: '50%', marginTop: -5, backgroundColor: accent }}
              />
              {body}
            </View>
          </SwipeableRow>
        );
      }}
    />
  );
}
