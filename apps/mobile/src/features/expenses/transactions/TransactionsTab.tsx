import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { View, Pressable, Text, RefreshControl } from 'react-native';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { formatCurrency } from '@/lib/formatters';
import { useThemeColors } from '~/theme/useThemeColors';
import { Icon } from '~/components/Icon';
import type { Account, Expense, ExpenseCategory, Hashtag } from '@/core/db/types';
import { isHiddenInSafeMode, isTagHiddenInSafeMode } from '@/core/expenses/categoryGroups';
import { Badge } from '~/components/ui/Badge';
import { SwipeableRow, type SwipeAction } from './SwipeableRow';
import { tint } from '~/lib/color';
import { usePullToRefresh } from '~/hooks/usePullToRefresh';

/** Stage 4's drill-in mark for one row (docs/plans/bank-balance-sync.md §7 Stage 4, mockup
 *  `bank-balance-sync-v2.html` Frame 3) — `'agree'` = the last-agreeing checkpoint, `'flag'` = the
 *  first-disagreeing checkpoint, `'still'` = a later checkpoint still unexplained by the same gap,
 *  `'gap'` = a standing-coverage-gap finding's own flagged transaction (`coverage.ts`'s
 *  `findStandingCoverageGaps`, surfaced via `accountVerification.ts`) — conceptually distinct from
 *  `'flag'`/`'still'`, which are checkpoint-mismatch-only terms ("first/still disagreeing checkpoint");
 *  a standing gap has no "first disagreeing" concept, every flagged transaction is an equal member of
 *  the same finding (bug found via on-device testing 2026-08-09, every flagged row wrongly said "First
 *  disagreeing"). */
export type CheckpointRowMark = 'agree' | 'flag' | 'still' | 'gap';

export interface CheckpointHighlight {
  marks: Map<string, CheckpointRowMark>;
  /** Renders a small "₹N gap" divider immediately above this transaction's row. */
  dividerBeforeId?: string;
  dividerLabel?: string;
  /** Auto-scrolls to this transaction once, on mount — the "scrolled to the flagged window" arrival
   *  state (Frame 3's own "arrival state" tag). */
  scrollToId?: string;
}

interface TransactionsTabProps {
  /** True only during the initial decrypt-on-load (see `useExpenses.ts`) — distinguishes "still loading"
   *  from "genuinely no transactions", which `grouped.length === 0` alone can't (both look identical). */
  loading: boolean;
  grouped: { label: string; items: Expense[] }[];
  categoryMap: Map<string, ExpenseCategory>;
  accountMap: Map<string, Account>;
  hashtags: Hashtag[];
  shouldMask: (sensitive: boolean | undefined) => boolean;
  /** Omit for a read-only list (e.g. `EntityTransactionsModal`'s account/category/tag drill-down) — rows
   *  render as plain, non-interactive `View`s instead of a `SwipeableRow` with nothing useful to swipe
   *  or tap into. */
  onEdit?: (expense: Expense) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (expense: Expense) => void;
  /** Share-later (Track E): opens the group picker for an as-yet-unshared expense. */
  onShare?: ((expense: Expense) => void) | undefined;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  /** Long-pressing a row (normal mode only) enters select mode with that row pre-selected — as if the
   *  user had tapped the select icon and then tapped the row. Omit for read-only lists (no select mode
   *  to enter). */
  onLongPressSelect?: (id: string) => void;
  /** Transactions that back a goal contribution — shown with a small target icon next to the title,
   *  same treatment as the receipt/shared-expense icons already here. */
  goalLinkedTxnIds?: Set<string>;
  /** Transactions whose recorded payment mode disagrees with their original bank-statement narration
   *  (2026-08-06, `useExpenses.ts`'s `paymentModeMismatchTxnIds`) — same small-icon-next-to-title
   *  treatment as the other three above; tapping the row opens the edit form, where the same mismatch
   *  is explained (and fixable) via a `Banner`. */
  paymentModeMismatchTxnIds?: Set<string>;
  /** Stage 4's checkpoint-diff drill-in — see {@link CheckpointHighlight}. Omitted everywhere else. */
  checkpointHighlight?: CheckpointHighlight;
  /** Pull-to-refresh — omit for a read-only list (e.g. `EntityTransactionsModal`'s drill-down), same
   *  gating as `onEdit`/`onDelete` above. */
  onRefresh?: () => void;
  /** Item 30 (docs/plans/real-device-testing-pass.md Phase 4) — the id of a transaction just saved as a
   *  brand-new entry (never an edit) via `TransactionsSlice.tsx`'s Add-transaction form. Scrolls to it
   *  once, the moment this changes — same `scrollToItem` mechanism as the Stage 4 checkpoint-diff
   *  drill-in's own `scrollToId` above, kept as a separate prop since the two features are otherwise
   *  unrelated. A no-op if the new transaction isn't actually in `grouped` (e.g. it was saved with a date
   *  outside the currently-active month filter). */
  scrollToNewTxnId?: string | null;
}

interface Row {
  key: string;
  txn: Expense;
  isLastRowOverall: boolean;
  /** Set only on the first transaction of a new day — rendered as a compact label sitting right on the
   *  rail above this row, instead of a separate full-width header row (2026-08-02: keeps the "date shown
   *  once per day" grouping while costing one small text line instead of a whole extra row's height). */
  dateLabel?: string;
  checkpointMark?: CheckpointRowMark;
  checkpointDividerLabel?: string;
}

interface RowProps {
  txn: Expense;
  categoryMap: Map<string, ExpenseCategory>;
  accountMap: Map<string, Account>;
  hashtags: Hashtag[];
  shouldMask: (sensitive: boolean | undefined) => boolean;
  onEdit?: (expense: Expense) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (expense: Expense) => void;
  onShare?: ((expense: Expense) => void) | undefined;
  checkpointMark?: CheckpointRowMark;
  checkpointDividerLabel?: string;
  onToggleSelect?: (id: string) => void;
  onLongPressSelect?: (id: string) => void;
  isLastRowOverall: boolean;
  isGoalLinked: boolean;
  isPaymentModeMismatch: boolean;
  dateLabel?: string;
}

interface SelectionContextValue {
  selectMode: boolean;
  selectedIds: Set<string>;
}

const EMPTY_SELECTED_IDS = new Set<string>();

/**
 * Item 35 fix (docs/plans/real-device-testing-pass.md Phase 4) — `selectMode`/`selectedIds` used to be
 * threaded through `renderItem`'s own closure (as plain props on `TransactionRow`), which meant they had
 * to sit in `renderItem`'s `useCallback` dependency array. Verified directly against FlashList v2's own
 * source (`recyclerview/ViewHolder.tsx`): its memoized `ViewHolder` wrapper's `React.memo` comparator
 * checks `prevProps.renderItem === nextProps.renderItem` (and rebuilds `children` via a `useMemo` keyed
 * on that same identity) — so any change to `renderItem`'s reference fails that check for *every*
 * currently-mounted `ViewHolder`, not just the one under the user's finger, forcing FlashList to redo each
 * cell's own layout/ref bookkeeping (not just re-run `TransactionRow`) on a single long-press-to-select.
 * Moving `selectMode`/`selectedIds` into this context instead keeps `renderItem` (below) fully stable
 * across a select-mode toggle — `ViewHolder`'s memo now bails entirely for unrelated cells, and only
 * `TransactionRow` (the actual context consumer) re-renders, via ordinary React context propagation
 * (which bypasses memoized ancestors by design) rather than FlashList's own cell-recreation path.
 */
const SelectionContext = createContext<SelectionContextValue>({
  selectMode: false,
  selectedIds: EMPTY_SELECTED_IDS
});

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
  onToggleSelect,
  onLongPressSelect,
  isLastRowOverall,
  isGoalLinked,
  isPaymentModeMismatch,
  dateLabel,
  checkpointMark,
  checkpointDividerLabel
}: RowProps) {
  const theme = useThemeColors();
  // Read via context, not a prop off `renderItem`'s closure — see `SelectionContext`'s doc comment above.
  const { selectMode, selectedIds } = useContext(SelectionContext);
  const isSelected = selectedIds.has(txn.id);
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
  // Transfers only: destination account, already on the same record (`Expense.toAccountId`) — no
  // paired-transaction lookup needed. Shown as "From → To" in place of the from-account-only line below,
  // so a transfer row is self-explanatory without opening it (found via user report: previously only the
  // from account was visible, so confirming a transfer's destination meant opening every row).
  const toAcc = txnType === 'transfer' && txn.toAccountId ? accountMap.get(txn.toAccountId) : undefined;
  const catLabel =
    txnType === 'transfer' ? 'Transfer' : (cat?.name ?? (txnType === 'income' ? 'Income' : 'Uncategorized'));
  const subtitle = catLabel;
  const masked = shouldMask((cat && isHiddenInSafeMode(cat)) || isTagHiddenInSafeMode(txn.hashtags, hashtags));

  // No separate icon badge here anymore — normal mode's rail icon (below) already shows category/type,
  // so repeating it next to the text would just be the same information twice. Select mode has no rail
  // at all, so it renders its own badge (see below) using this same `icon`/`accent`.
  const content = (
    <>
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
          {isGoalLinked && (
            <View className="ml-1">
              <Icon name="ti-target" size={12} color={theme.success} />
            </View>
          )}
          {isPaymentModeMismatch && (
            <View className="ml-1">
              <Icon name="ti-alert-triangle" size={12} color={theme.warning} />
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
        {/* Stage 4 checkpoint-diff drill-in (docs/plans/bank-balance-sync.md §7 Stage 4, mockup
            `bank-balance-sync-v2.html` Frame 3) — the exact last-agreeing/first-disagreeing pair the
            diagnostic engine flagged, plus any later still-unexplained checkpoint on the same account. */}
        {checkpointMark && (
          <View className="mt-1">
            <Badge
              label={
                checkpointMark === 'agree'
                  ? 'Last agreeing'
                  : checkpointMark === 'flag'
                    ? 'First disagreeing'
                    : checkpointMark === 'gap'
                      ? 'No matching statement line'
                      : 'Still unexplained'
              }
              icon={checkpointMark === 'agree' ? 'ti-check' : 'ti-alert-triangle'}
              color={checkpointMark === 'agree' ? theme.success : theme.danger}
              variant={checkpointMark === 'flag' || checkpointMark === 'gap' ? 'solid' : 'subtle'}
              size="sm"
              rounded="md"
            />
          </View>
        )}
      </View>
      <View className="items-end ml-2 shrink-0">
        <Text className="text-sm font-bold" style={{ color: masked ? theme.textPrimary : amountColor }}>
          {masked ? '••••' : `${prefix}${formatCurrency(txn.amount)}`}
        </Text>
        {toAcc?.name ? (
          <Text className="text-[10px] text-tertiary mt-0.5" numberOfLines={1}>
            {acc?.name ?? '—'} → {toAcc.name}
          </Text>
        ) : (
          acc?.name && (
            <Text className="text-[10px] text-tertiary mt-0.5" numberOfLines={1}>
              {acc.name}
            </Text>
          )
        )}
      </View>
    </>
  );

  // Rules-of-hooks: `isShared`/`actions` (needed only by normal mode, below) are computed unconditionally,
  // ahead of the `selectMode` early return — a hook (the `useMemo` for `actions`) can't sit after a
  // conditional `return` without changing hook-call order between renders.
  const isShared = (txn.shareWith?.length ?? 0) > 0;
  // Memoized — `SwipeableRow` below is `memo`'d, but a plain inline array literal here got a fresh
  // identity on every render of this (already-memoized) row, defeating that memo the moment anything
  // else about this row's own render changed (e.g. an unrelated prop like `hashtags`/`categoryMap`
  // getting a new identity elsewhere in the tree). Low-severity on its own, but free to fix alongside
  // the real O(n) issues above (found 2026-08-14).
  const actions: SwipeAction[] = useMemo(
    () => [
      ...(onDuplicate ? [{ icon: 'ti-copy', label: 'Copy', color: theme.info, onPress: () => onDuplicate(txn) }] : []),
      ...(onShare && txnType === 'expense' && !isShared
        ? [{ icon: 'ti-users-group', label: 'Share', color: theme.primary, onPress: () => onShare(txn) }]
        : []),
      ...(onDelete ? [{ icon: 'ti-trash', label: 'Delete', color: theme.danger, onPress: () => onDelete(txn.id) }] : [])
    ],
    [onDuplicate, onShare, txnType, isShared, onDelete, txn, theme.info, theme.primary, theme.danger]
  );

  // Select mode: flat tappable row with a checkbox; no rail, so it needs its own icon badge. The date
  // header below is the same block normal mode renders further down (~line 320) — hoisted up here too
  // rather than left to only that branch, which used to make the date disappear entirely while
  // multi-selecting (found via real-device testing, 2026-08-18): the select-mode branch returned before
  // ever reaching it.
  if (selectMode) {
    return (
      <View>
        {dateLabel && (
          <View className="pl-4 pr-4 pt-2 pb-0.5">
            <Text className="text-[9px] font-extrabold uppercase tracking-wide text-tertiary">{dateLabel}</Text>
          </View>
        )}
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
          <View
            className="w-9 h-9 rounded-xl items-center justify-center shrink-0"
            style={{ backgroundColor: tint(accent, 12) }}
          >
            <Icon name={icon} size={18} color={accent} />
          </View>
          {content}
        </Pressable>
      </View>
    );
  }

  // Normal mode: timeline rail lives INSIDE the row, its dot now the category/type icon itself (filled,
  // tinted) — doing what the separate icon badge above used to do; swipe-left → Copy/Delete; tap → edit.
  // Stage 4's search-window divider (mockup Frame 3's dashed "₹120 gap" separator) — a small full-width
  // callout inserted immediately above the first-disagreeing row, regardless of `dateLabel`/day grouping.
  const dividerRow = checkpointDividerLabel && (
    <View className="flex-row items-center gap-2 px-4 py-1.5">
      <View className="flex-1 h-px" style={{ backgroundColor: tint(theme.danger, 40) }} />
      <Text className="text-[9px] font-extrabold uppercase tracking-wide" style={{ color: theme.danger }}>
        {checkpointDividerLabel}
      </Text>
      <View className="flex-1 h-px" style={{ backgroundColor: tint(theme.danger, 40) }} />
    </View>
  );

  const checkpointRowTint =
    checkpointMark === 'flag' || checkpointMark === 'gap'
      ? tint(theme.danger, 9)
      : checkpointMark === 'still'
        ? tint(theme.danger, 4)
        : undefined;

  const rowInner = (
    <View>
      {dividerRow}
      {/* Date label — set only on the first transaction of a new day. Sits in normal flow, right on
          the rail's own horizontal position, above the row it belongs to (never a negative-offset
          overlay, which a virtualized list would risk clipping against the previous cell's bounds). */}
      {dateLabel && (
        <View className="pl-3 pr-4 pt-2 pb-0.5">
          <Text className="text-[9px] font-extrabold uppercase tracking-wide text-tertiary">{dateLabel}</Text>
        </View>
      )}
      <View
        className="relative w-full flex-row items-center gap-3 pl-12 pr-4 py-3"
        style={
          checkpointRowTint
            ? { backgroundColor: checkpointRowTint }
            : isShared
              ? { backgroundColor: tint(theme.primary, 6) }
              : undefined
        }
      >
        {/* Rail + icon, truly centered on the row regardless of its actual rendered height (which now
            varies — the account line under the amount makes some rows taller than others). A flex
            column with two equal-flex fillers around the fixed-size icon tile, not `top: '50%'` +
            `marginTop` — RN's percentage-of-parent positioning for an absolutely-positioned sibling
            isn't reliable on-device under this project's NativeWind/interop setup (same class of bug
            `MainTabs.tsx`'s `HeaderCenter` already hit once), where plain flex distribution inside a
            top/bottom-anchored (so already definite-height) absolute container always resolves
            correctly. */}
        <View className="absolute" style={{ left: 12, top: 0, bottom: 0, width: 24, alignItems: 'center' }}>
          <View style={{ width: 1, flex: 1, backgroundColor: theme.border }} />
          <View
            className="w-[22px] h-[22px] rounded-lg items-center justify-center"
            style={{ backgroundColor: accent }}
          >
            <Icon name={icon} size={13} color="#fff" />
          </View>
          <View style={{ width: 1, flex: isLastRowOverall ? 0 : 1, backgroundColor: theme.border }} />
        </View>
        {content}
      </View>
    </View>
  );

  // Read-only (no `onEdit`, e.g. `EntityTransactionsModal`'s drill-down lists): a plain row, no
  // `SwipeableRow` — nothing to swipe into and nothing for a tap to do, so mounting a real
  // gesture-handler instance for it would be pure overhead.
  if (!onEdit) return rowInner;

  return (
    <SwipeableRow
      actions={actions}
      onTap={() => onEdit(txn)}
      onLongPress={onLongPressSelect ? () => onLongPressSelect(txn.id) : undefined}
    >
      {rowInner}
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
 * larger datasets smoothly. Sections are flattened into one `Row[]` — day boundaries used to be a
 * separate `header` row type recycled from its own pool; as of 2026-08-02 there's only one row shape
 * (a day's first transaction just carries an extra `dateLabel`, rendered inline on the rail instead of
 * as its own list item), so every row recycles from the same single pool now.
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
  onToggleSelect,
  onLongPressSelect,
  goalLinkedTxnIds,
  paymentModeMismatchTxnIds,
  checkpointHighlight,
  onRefresh,
  scrollToNewTxnId
}: TransactionsTabProps) {
  const theme = useThemeColors();
  const listRef = useRef<FlashListRef<Row> | null>(null);
  const { refreshing, onRefresh: handleRefresh } = usePullToRefresh(onRefresh ?? (() => {}));

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
      g.items.forEach((txn, ti) => {
        const isLastRowOverall = gi === grouped.length - 1 && ti === g.items.length - 1;
        out.push({
          key: txn.id,
          txn,
          isLastRowOverall,
          ...(ti === 0 ? { dateLabel: g.label } : {}),
          ...(checkpointHighlight?.marks.has(txn.id) ? { checkpointMark: checkpointHighlight.marks.get(txn.id) } : {}),
          ...(checkpointHighlight?.dividerBeforeId === txn.id
            ? { checkpointDividerLabel: checkpointHighlight.dividerLabel }
            : {})
        });
      });
    });
    return out;
  }, [grouped, checkpointHighlight]);

  // Stage 4's "arrival state" (mockup Frame 3) — scroll to the flagged window once, on mount/whenever
  // the target changes (e.g. a different account's modal reopens re-using the same mounted list).
  useEffect(() => {
    if (!checkpointHighlight?.scrollToId) return;
    const target = rows.find((r) => r.key === checkpointHighlight.scrollToId);
    if (!target) return;
    listRef.current?.scrollToItem({ item: target, animated: false, viewPosition: 0.15 });
    // Deliberately omits `rows` from the deps below — only re-run when the target id itself changes,
    // not on every `rows` identity change (the list re-renders far more often than the highlight target
    // does, and re-scrolling on every render would fight the user's own scrolling).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkpointHighlight?.scrollToId]);

  // Item 30 — auto-scroll to a newly-added (never edited) transaction once the Add form closes after a
  // successful save; see `scrollToNewTxnId`'s doc comment above. Same "only re-run when the target id
  // itself changes" reasoning as the checkpoint effect above — `rows` changes far more often than a new
  // save happens, and re-scrolling on every unrelated `rows` update would fight the user's own scrolling.
  useEffect(() => {
    if (!scrollToNewTxnId) return;
    const target = rows.find((r) => r.key === scrollToNewTxnId);
    if (!target) return;
    listRef.current?.scrollToItem({ item: target, animated: true, viewPosition: 0.1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToNewTxnId]);

  const keyExtractor = useCallback((row: Row) => row.key, []);

  // Item 35 fix — `selectMode`/`selectedIds` deliberately dropped from this closure/its deps (they used
  // to live here, forcing FlashList to treat every long-press-to-select or subsequent selection toggle as
  // a `renderItem` identity change — see `SelectionContext`'s doc comment above for the exact FlashList
  // v2 source confirming why that's expensive). `TransactionRow` now reads them from context instead.
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Row>) => (
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
        onToggleSelect={onToggleSelect}
        onLongPressSelect={onLongPressSelect}
        isLastRowOverall={item.isLastRowOverall}
        isGoalLinked={goalLinkedTxnIds?.has(item.txn.id) ?? false}
        isPaymentModeMismatch={paymentModeMismatchTxnIds?.has(item.txn.id) ?? false}
        dateLabel={item.dateLabel}
        checkpointMark={item.checkpointMark}
        checkpointDividerLabel={item.checkpointDividerLabel}
      />
    ),
    [
      categoryMap,
      accountMap,
      hashtags,
      shouldMask,
      onEdit,
      onDelete,
      onDuplicate,
      onShare,
      onToggleSelect,
      onLongPressSelect,
      goalLinkedTxnIds,
      paymentModeMismatchTxnIds
    ]
  );

  // Provider value for `SelectionContext` — memoized so it only creates a new object (and thus only
  // actually propagates to context consumers) when `selectMode`/`selectedIds` genuinely change, not on
  // every render of this component.
  const selectionContextValue = useMemo<SelectionContextValue>(
    () => ({ selectMode, selectedIds: selectedIds ?? EMPTY_SELECTED_IDS }),
    [selectMode, selectedIds]
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
    // Item 35 fix — provides `selectMode`/`selectedIds` to every `TransactionRow` via context instead of
    // through `renderItem`'s own closure; see `SelectionContext`'s doc comment above.
    <SelectionContext.Provider value={selectionContextValue}>
      <FlashList
        ref={listRef}
        style={{ flex: 1, backgroundColor: theme.surfaceTertiary }}
        // The list's own background uses the same fixed `theme.surfaceTertiary` the row cards use (see
        // `SwipeableRow.tsx`'s `bg-surface-3`) — not the privacy-mode-tinted `modeBg` this used to be.
        // Web's own `TransactionsTab` deliberately gives its rows a fixed, non-privacy-tinted background so
        // "the list reads as one uniform surface" (see that file's comment) — matching that here means the
        // gaps between rows need the same fixed color the rows have, not the ambient page tint, or they
        // visibly seam against the opaque row cards (found via user report: looked like a mistint, not a
        // themed background).
        contentContainerStyle={{ paddingBottom: 96 }}
        data={rows}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />
          ) : undefined
        }
        // Default is 250dp — the buffer of off-screen rows kept pre-rendered ahead of the viewport.
        // Bumped after a user-reported blank flash during a fast fling: a larger buffer gives the recycler
        // more lead room before a cell scrolls into view with no rendered content yet to swap in.
        drawDistance={500}
      />
    </SelectionContext.Provider>
  );
}
