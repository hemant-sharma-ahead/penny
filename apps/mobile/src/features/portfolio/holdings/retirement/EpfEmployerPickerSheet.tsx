// "Choose employer" picker — what "See all transactions" opens when a holding has 2+ EPF employers,
// per docs/plans/epf-passbook-import.md's 2026-08-11 follow-up round (mirrors EPFO's own portal and
// INDmoney's "select Member ID → view that passbook" model). Skipped entirely for the common 0-1
// employer case — `RetirementCard.tsx` goes straight to `EpfAllTransactionsSheet` then, scoped or not.
// Mockup: docs/mockups/proposals/epf-employer-switch-v1.html §3.
import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Modal } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import { epfMonthLabel, epfMonthsBetween } from '@/core/portfolio/epfCalculations';
import type { EpfEmployer, EpfTransaction } from '@/core/db/types';
import { resolveAnyTxnOwner } from './epfEmployerScoping';

interface EpfEmployerPickerSheetProps {
  employers: EpfEmployer[];
  transactions: EpfTransaction[];
  onSelect: (employer: EpfEmployer) => void;
  onClose: () => void;
}

export function EpfEmployerPickerSheet({ employers, transactions, onSelect, onClose }: EpfEmployerPickerSheetProps) {
  const theme = useThemeColors();
  // `useState` lazy initializer, not a bare `Date.now()` call — the React Compiler's purity check
  // flags any impure call in the render body, even one this harmless (tenure display only, never
  // re-read). Same escape hatch `PpfAllTransactionsSheet.tsx` already uses for `dateToFyStartYear
  // (Date.now())`.
  const [now] = useState(() => Date.now());

  return (
    <Modal onClose={onClose} title="Choose employer" scrollable>
      <View className="-mt-2">
        {employers.map((emp, i) => {
          const count = transactions.filter((t) => resolveAnyTxnOwner(t, employers)?.id === emp.id).length;
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
