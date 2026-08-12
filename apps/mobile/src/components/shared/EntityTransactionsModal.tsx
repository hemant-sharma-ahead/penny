import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import type { Account, Expense, ExpenseCategory, Hashtag } from '@/core/db/types';
import { groupExpensesByDate } from '@/core/expenses/filterAndAggregate';
import { Modal } from '~/components/ui';
import { TransactionsTab, type CheckpointHighlight } from '~/features/expenses/transactions/TransactionsTab';

interface EntityTransactionsModalProps {
  title: string;
  subtitle?: string;
  statLabel?: string;
  statValue?: string;
  statColor?: string;
  /** Already filtered by the caller (one account, one category, one tag, one synthetic Set-Aside
   *  group…) — this component doesn't know or care what the scoping criterion was. */
  expenses: Expense[];
  categoryMap: Map<string, ExpenseCategory>;
  accountMap: Map<string, Account>;
  hashtags: Hashtag[];
  shouldMask: (sensitive: boolean | undefined) => boolean;
  goalLinkedTxnIds?: Set<string>;
  /** Extra content rendered directly below the stat row, above the transaction list — same slot every
   *  time, only its content changes (docs/plans/bank-balance-sync.md §7 Stage 4, mockup
   *  `bank-balance-sync-v2.html` Frame 2: "same stat-row slot, same position for the banner every
   *  time"). Generic on purpose — this modal is reused by categories/tags/goals too, so it has no
   *  bank-import-specific knowledge itself; `AccountList.tsx`'s own wrapper builds this JSX. */
  banner?: ReactNode;
  /** Stage 4's transaction-list drill-in (mockup Frame 3) — passed straight through to
   *  `TransactionsTab`. Omitted everywhere else. */
  checkpointHighlight?: CheckpointHighlight;
  /** Pinned action row below the list (mockup Frame 3's "View full reconciliation table ›") — forwarded
   *  straight to `Modal`'s own `footer` slot. Omitted everywhere else. */
  footer?: ReactNode;
  onClose: () => void;
}

/**
 * "View transactions for X" — opened in place from wherever an entity (an account, a category, an
 * intent group, a tag, a Set-Aside line) is browsed, rather than navigating to the Transactions tab with
 * a preset filter. Chosen over a deep-link (2026-08-02 design discussion) because a modal preserves
 * whatever scroll position/month/tab the caller already had — dismiss it and you're back exactly where
 * you were — and because it needs no new `FilterState` dimensions (the Filter modal has no tag or
 * IOU-linked filter today); the caller just filters its own already-in-scope `expenses` array with plain
 * JS instead.
 *
 * Read-only by design (`TransactionsTab`'s `onEdit` omitted) — this is a browse/verify view, not an edit
 * surface; editing a transaction you spot here still happens from the real Transactions tab. Reuses
 * `TransactionsTab` itself (already virtualized via `FlashList`, already has the rail-icon/inline-date
 * treatment) rather than a second, simpler list renderer — "all transactions for this account" isn't
 * naturally small the way e.g. Goal's unlinked-transaction picker is, so it needs the same performance
 * characteristics as the main list, not a capped `.map()`.
 *
 * `TransactionsTab` stays in `features/expenses/transactions/` rather than moving here — same trade-off
 * `ExpenseForm.tsx`'s own relocation note already documents: a shared component importing one specific,
 * still-feature-owned piece via an absolute path, not a full subsystem relocation for one consumer.
 */
export function EntityTransactionsModal({
  title,
  subtitle,
  statLabel,
  statValue,
  statColor,
  expenses,
  categoryMap,
  accountMap,
  hashtags,
  shouldMask,
  goalLinkedTxnIds,
  banner,
  checkpointHighlight,
  footer,
  onClose
}: EntityTransactionsModalProps) {
  const { height: screenHeight } = useWindowDimensions();
  const grouped = useMemo(() => groupExpensesByDate(expenses), [expenses]);

  return (
    <Modal onClose={onClose} title={title} footer={footer}>
      {subtitle && <Text className="text-xs text-tertiary -mt-2">{subtitle}</Text>}
      {statLabel && statValue && (
        <View className="flex-row items-center justify-between rounded-xl border border-theme bg-surface-2 px-3.5 py-2.5">
          <Text className="text-xs text-secondary">{statLabel}</Text>
          <Text className="text-base font-bold" style={{ color: statColor ?? undefined }}>
            {statValue}
          </Text>
        </View>
      )}
      {banner}
      {/* `TransactionsTab` mounts its own `FlashList` (needs `flex: 1` inside a definite-height parent to
          size itself) — `Modal`'s own card sizes to content by default, so this gives it one explicitly
          rather than collapsing to zero height. Reserves less when a `banner` is present (found + fixed
          2026-08-11, on-device testing) — a fixed 55% of the FULL screen height, plus the title/stat
          row, plus a tall multi-line verification banner (headline + detail + two buttons), could
          together exceed the modal card's own available height with no banner-aware headroom, spilling
          the transaction list past the card's rounded corners onto the backdrop instead of scrolling. */}
      <View style={{ height: screenHeight * (banner ? 0.4 : 0.55) }}>
        <TransactionsTab
          loading={false}
          grouped={grouped}
          categoryMap={categoryMap}
          accountMap={accountMap}
          hashtags={hashtags}
          shouldMask={shouldMask}
          goalLinkedTxnIds={goalLinkedTxnIds}
          checkpointHighlight={checkpointHighlight}
        />
      </View>
    </Modal>
  );
}
