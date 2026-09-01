// "Choose employer" picker — what "See all transactions" opens when a holding has 2+ EPF employers,
// per docs/plans/epf-passbook-import.md's 2026-08-11 follow-up round (mirrors EPFO's own portal and
// INDmoney's "select Member ID → view that passbook" model). Skipped entirely for the common 0-1
// employer case — `RetirementCard.tsx` goes straight to `EpfAllTransactionsSheet` then, scoped or not.
// Mockup: docs/mockups/proposals/epf-employer-switch-v1.html §3.
import { useMemo, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Modal } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { epfMonthLabel, epfMonthsBetween } from '@/core/portfolio/epfCalculations';
import type { EpfEmployer, EpfTransaction } from '@/core/db/types';
import type { EpfRateTable } from '@/core/portfolio/epfInterestRates';
import { resolveAnyTxnOwner } from './epfEmployerScoping';
import { findAllReviewFlags } from './epfReviewFlags';

interface EpfEmployerPickerSheetProps {
  employers: EpfEmployer[];
  transactions: EpfTransaction[];
  /** Same table `RetirementCard`'s own card-level "N need review" count uses — passed through so each
   *  employer row here can show ITS OWN count via the exact same `findAllReviewFlags` function,
   *  rather than only ever showing one combined total at the card level (2026-08-30 fix: tapping
   *  through to "Choose employer" previously gave no hint of which employer the flagged rows actually
   *  belonged to). `null` just means the count can't be computed yet — never shown as 0. */
  rateTable: EpfRateTable | null;
  onSelect: (employer: EpfEmployer) => void;
  onClose: () => void;
}

export function EpfEmployerPickerSheet({
  employers,
  transactions,
  rateTable,
  onSelect,
  onClose
}: EpfEmployerPickerSheetProps) {
  const theme = useThemeColors();
  // `useState` lazy initializer, not a bare `Date.now()` call — the React Compiler's purity check
  // flags any impure call in the render body, even one this harmless (tenure display only, never
  // re-read). Same escape hatch `PpfAllTransactionsSheet.tsx` already uses for `dateToFyStartYear
  // (Date.now())`.
  const [now] = useState(() => Date.now());

  // Per-employer "N need review" counts (2026-08-30) — one `findAllReviewFlags` call, same as the
  // card's own count, then attributed back to whichever employer each flag actually belongs to.
  // `wageDiscrepancy`/`joiningDateContradiction` flags carry their own `employer` directly;
  // `interestMismatch` only carries a `txnId`, so it's resolved back to an owner via the same
  // `resolveAnyTxnOwner` every other per-employer scoping in this feature already uses.
  const reviewCountByEmployerId = useMemo(() => {
    const counts = new Map<string, number>();
    if (!rateTable) return counts;
    const bump = (id: string | undefined) => {
      if (!id) return;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    };
    for (const flag of findAllReviewFlags(employers, transactions, rateTable)) {
      if (flag.kind === 'interestMismatch') {
        const txn = transactions.find((t) => t.id === flag.txnId);
        bump(txn ? resolveAnyTxnOwner(txn, employers)?.id : undefined);
      } else {
        bump(flag.employer.id);
      }
    }
    return counts;
  }, [employers, transactions, rateTable]);

  return (
    <Modal onClose={onClose} title="Choose employer" scrollable>
      <View className="-mt-2">
        {employers.map((emp, i) => {
          const count = transactions.filter((t) => resolveAnyTxnOwner(t, employers)?.id === emp.id).length;
          const reviewCount = reviewCountByEmployerId.get(emp.id) ?? 0;
          return (
            <Pressable
              key={emp.id}
              onPress={() => onSelect(emp)}
              className={`flex-row items-center gap-3 py-3 ${i > 0 ? 'border-t border-theme' : ''}`}
            >
              <View
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: tint('#64748b', 12) }}
              >
                <Icon name="ti-building" size={15} color="#64748b" />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-bold text-primary">{emp.companyName}</Text>
                <Text className="text-[10px] text-tertiary mt-0.5">
                  {epfMonthLabel(emp.fromDate)} – {emp.toDate ? epfMonthLabel(emp.toDate) : 'present'} ·{' '}
                  {epfMonthsBetween(emp.fromDate, emp.toDate ?? now)} months
                </Text>
              </View>
              {reviewCount > 0 && (
                <View
                  className="flex-row items-center gap-1 px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: tint(theme.warning, 15) }}
                >
                  <Icon name="ti-alert-triangle" size={9} color={theme.warning} />
                  <Text className="text-[9px] font-bold" style={{ color: theme.warning }}>
                    {reviewCount} need review
                  </Text>
                </View>
              )}
              <Text className="text-[10px] text-tertiary">
                {count} txn{count === 1 ? '' : 's'}
              </Text>
              <Icon name="ti-chevron-right" size={13} color={theme.textTertiary} />
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}
