// Shared PPF transaction-type display labels/colors — mirrors `epfTxLabels.ts`'s role for EPF. Used by
// `RetirementCard.tsx`'s card (deposit-badge/attention-banner styling) and by `RetirementSheets.tsx`'s
// `PpfAllTransactionsSheet` transaction rows, which need the exact same labels/colors. Kept in its own
// file (not re-exported from either component file) so both stay Fast-Refresh-clean.
import type { PpfTransactionType } from '@/core/db/types';

export const PPF_TX_LABELS: Record<PpfTransactionType, string> = {
  deposit: 'Deposit',
  interest: 'Interest',
  withdrawal: 'Withdrawal'
};

export const PPF_TX_COLORS: Record<PpfTransactionType, string> = {
  deposit: '#8b5cf6',
  interest: '#10b981',
  withdrawal: '#f59e0b'
};
