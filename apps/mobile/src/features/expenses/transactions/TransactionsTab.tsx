import { memo, useCallback, useMemo } from 'react';
import { View, Pressable, Text } from 'react-native';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { formatCurrency } from '@/lib/formatters';
import { useThemeColors } from '~/theme/useThemeColors';
import { Icon } from '~/components/Icon';
import type { Account, Expense, ExpenseCategory, Hashtag } from '@/core/db/types';
import { isHiddenInSafeMode, isTagHiddenInSafeMode } from '@/core/expenses/categoryGroups';
import { SwipeableRow, type SwipeAction } from './SwipeableRow';
import { tint } from '~/lib/color';

interface TransactionsTabProps {
  /** True only during the initial decrypt-on-load (see `useExpenses.ts`) — distinguishes "still loading"
   *  from "genuinely no transactions", which `grouped.length === 0` alone can't (both look identical). */
  loading: boolean;
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

type Row =
  | { kind: 'header'; key: string; title: string; isFirst: boolean }
  | { kind: 'txn'; key: string; txn: Expense; isLastRowOverall: boolean };

interface RowProps {
  txn: Expense;
  categoryMap: Map<string, ExpenseCategory>;
  accountMap: Map<string, Account>;
  hashtags: Hashtag[];
  shouldMask: (sensitive: boolean | undefined) => boolean;
  onEdit: (expense: Expense) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (expense: Expense) => void;
  onShare?: ((expense: Expense) => void) | undefined;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect?: (id: string) => void;
  isLastRowOverall: boolean;
}

/**
 * One transaction row, extracted out of `renderItem` and wrapped in `React.memo` — found via a real
 * on-device bug (a user-reported screenshot: the whole list goes blank mid-scroll). This is a known
 * `VirtualizedList` failure mode, not just "feels slow": each row mounts a `SwipeableRow`
 * (`react-native-gesture-handler`'s `ReanimatedSwipeable` — a real native pan-gesture recognizer +
 * Reanimated shared values, not a cheap `View`), and when `renderItem` was an inline closure recreated
 * on every render of the parent, every visible row re-rendered (and its `SwipeableRow` child re-created
 * its `actions` array) on any unrelated state change — competing with the JS thread's ability to mount
 * *new* rows scrolling into view fast enough, which is what actually produces the blank recycled cells
 * (RN's own documented behavior when a fast scroll outpaces `renderItem`). Memoizing the row doesn't
 * reduce the inherent cost of mounting a new `SwipeableRow` as it scrolls into the window, but it removes
 * the *extra*, avoidable re-render cost competing for the same JS thread during that critical window.
 */
const TransactionRow = memo(function TransactionRow({
  txn,
  categoryMap,
  accountMap,
  hashtags,
  shouldMask,
  onEdit,
  onDelete,
  onDuplicate,
  onShare,
  selectMode,
  isSelected,
  onToggleSelect,
  isLastRowOverall
}: RowProps) {
  const theme = useThemeColors();
  const txnType = txn.type ?? 'expense';
  const cat = categoryMap.get(txn.categoryId);
  const accent = txnType === 'income' ? '#10b981' : txnType === 'transfer' ? '#3b82f6' : (cat?.color ?? '#6b7280');
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
  const masked = shouldMask((cat && isHiddenInSafeMode(cat)) || isTagHiddenInSafeMode(txn.hashtags, hashtags));

  const body = (
    <>
      <View
        className="w-9 h-9 rounded-xl items-center justify-center shrink-0"
        style={{ backgroundColor: tint(accent, 12) }}
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
      <Text className="text-sm font-bold ml-2 shrink-0" style={{ color: masked ? theme.textPrimary : amountColor }}>
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
        style={isSelected ? { backgroundColor: theme.surfaceSecondary } : undefined}
      >
        <Icon
          name={isSelected ? 'ti-circle-check-filled' : 'ti-circle'}
          size={20}
          color={isSelected ? theme.primary : theme.textTertiary}
        />
        {body}
      </Pressable>
    );
  }

  // Normal mode: timeline rail + dot live INSIDE the row; swipe-left → Copy/Delete; tap → edit.
  const isShared = (txn.shareWith?.length ?? 0) > 0;
  const actions: SwipeAction[] = [
    ...(onDuplicate ? [{ icon: 'ti-copy', label: 'Copy', color: theme.info, onPress: () => onDuplicate(txn) }] : []),
    ...(onShare && txnType === 'expense' && !isShared
      ? [{ icon: 'ti-users-group', label: 'Share', color: theme.primary, onPress: () => onShare(txn) }]
      : []),
    ...(onDelete ? [{ icon: 'ti-trash', label: 'Delete', color: theme.danger, onPress: () => onDelete(txn.id) }] : [])
  ];
  return (
    <SwipeableRow actions={actions} onTap={() => onEdit(txn)}>
      <View
        className="relative w-full flex-row items-center gap-3 pl-10 pr-4 py-3"
        style={isShared ? { backgroundColor: tint(theme.primary, 6) } : undefined}
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
});

/**
 * RN port of apps/web-react/src/features/expenses/transactions/TransactionsTab.tsx. Groups is now
 * ported — this restores web's `onShare`/`shareGroups`-driven "Share" swipe action and the
 * shared-with-group (`ti-users-group`) badge on a transaction's title, both previously dropped here.
 *
 * Rebuilt on `@shopify/flash-list`'s `FlashList` (was `SectionList`, before that a plain `View`+`.map()`
 * inside a parent `ScrollView`). `SectionList`/`VirtualizedList` **destroys and recreates** a row's whole
 * component tree every time it scrolls out of and back into the render window — for a row that mounts a
 * real `react-native-gesture-handler` instance (`SwipeableRow`), that's the actual irreducible cost that
 * no amount of `windowSize`/`maxToRenderPerBatch` tuning removes, and it's exactly why scrolling back UP to
 * an already-seen transaction still re-rendered and lagged even after the `sections`/callback identity bug
 * (see git history) was fixed. `FlashList` uses cell **recycling** instead — a fixed pool of mounted row
 * components gets its props swapped in place as you scroll, the same strategy native list views (Android
 * `RecyclerView`, iOS `UITableView` reused cells) and cross-platform apps built on them use to handle much
 * larger datasets smoothly. Sections are flattened into one `Row[]` (`header`/`txn` variants) with
 * `getItemType` so headers and transaction rows recycle from separate pools instead of colliding.
 * `TransactionsSlice.tsx`'s wrapping `ScrollView` stays removed — this owns its own scroll.
 */
export function TransactionsTab({
  loading,
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

  // Skeleton rows instead of silently reusing the empty state — while `expensesRepo.getAll()` is still
  // decrypting, `grouped` is indistinguishable from "genuinely no transactions" (both are `[]`), so
  // without this the list flashed a wrong "No transactions yet" message during every load, not just a
  // blank screen. Found via user report of the Transactions tab feeling laggy/broken on entry.
  //
  // Flattened + memoized on `grouped` specifically — a fresh array/object identity on every render of the
  // (large, frequently-re-rendering) parent `TransactionsSlice` previously made the list treat the entire
  // dataset as new on every unrelated parent re-render, including ones mid-scroll. That's fixed here too,
  // on top of the recycling change above.
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    grouped.forEach((g, gi) => {
      out.push({ kind: 'header', key: `h:${g.label}`, title: g.label, isFirst: gi === 0 });
      g.items.forEach((txn, ti) => {
        const isLastRowOverall = gi === grouped.length - 1 && ti === g.items.length - 1;
        out.push({ kind: 'txn', key: txn.id, txn, isLastRowOverall });
      });
    });
    return out;
  }, [grouped]);

  const keyExtractor = useCallback((row: Row) => row.key, []);
  const getItemType = useCallback((row: Row) => row.kind, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Row>) => {
      if (item.kind === 'header') {
        return (
          <View className="relative pl-10 pr-4 pt-4 pb-1.5" style={{ backgroundColor: theme.surfaceTertiary }}>
            <View
              className="absolute w-px"
              style={{ left: 20, top: item.isFirst ? '55%' : 0, bottom: 0, backgroundColor: theme.border }}
            />
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">{item.title}</Text>
          </View>
        );
      }
      return (
        <TransactionRow
          txn={item.txn}
          categoryMap={categoryMap}
          accountMap={accountMap}
          hashtags={hashtags}
          shouldMask={shouldMask}
          onEdit={onEdit}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onShare={onShare}
          selectMode={selectMode}
          isSelected={selectedIds?.has(item.txn.id) ?? false}
          onToggleSelect={onToggleSelect}
          isLastRowOverall={item.isLastRowOverall}
        />
      );
    },
    [
      theme.surfaceTertiary,
      theme.border,
      categoryMap,
      accountMap,
      hashtags,
      shouldMask,
      onEdit,
      onDelete,
      onDuplicate,
      onShare,
      selectMode,
      selectedIds,
      onToggleSelect
    ]
  );

  if (loading) {
    return (
      <View className="px-4 pt-4 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <View key={i} className="flex-row items-center gap-3">
            <View className="w-9 h-9 rounded-xl bg-surface-2" />
            <View className="flex-1 gap-1.5">
              <View className="h-3 rounded-sm bg-surface-2" style={{ width: `${55 + (i % 3) * 10}%` }} />
              <View className="h-2.5 rounded-sm bg-surface-2" style={{ width: `${30 + (i % 4) * 8}%` }} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (grouped.length === 0) {
    return (
      <View className="p-10 items-center">
        <Icon name="ti-wallet" size={44} color={theme.textTertiary} />
        <Text className="text-sm mt-3 text-tertiary">No transactions yet. Tap + to add one.</Text>
      </View>
    );
  }

  return (
    <FlashList
      style={{ flex: 1, backgroundColor: theme.surfaceTertiary }}
      // Both the list's own background and each section's date header use the same fixed
      // `theme.surfaceTertiary` the row cards below use (see `SwipeableRow.tsx`'s `bg-surface-3`) —
      // not the privacy-mode-tinted `modeBg` this used to be. Web's own `TransactionsTab` deliberately
      // gives its rows a fixed, non-privacy-tinted background so "the list reads as one uniform
      // surface" (see that file's comment) — matching that here means the date headers/gaps need the
      // same fixed color the rows have, not the ambient page tint, or they visibly seam against the
      // opaque row cards (found via user report: looked like a mistint, not a themed background).
      contentContainerStyle={{ paddingBottom: 96 }}
      data={rows}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      renderItem={renderItem}
      // Default is 250dp — the buffer of off-screen rows kept pre-rendered ahead of the viewport.
      // Bumped after a user-reported blank flash during a fast fling: a larger buffer gives the recycler
      // more lead room before a cell scrolls into view with no rendered content yet to swap in.
      drawDistance={500}
    />
  );
}
