// Shared EPF transaction-type display labels/colors — used by `RetirementSheets.tsx`'s transaction list
// and by the import-review flow (`epfImportLogic.ts`/`EpfImportReviewSheet.tsx`), which needs the exact
// same labels. Kept in its own file (not re-exported from `RetirementSheets.tsx`) so that component file
// can stay Fast-Refresh-clean (only exporting components).
import type { EpfTransactionType } from '@/core/db/types';

export const EPF_TX_LABELS: Record<EpfTransactionType, string> = {
  contribution: 'Contribution',
  interest: 'Interest credit',
  transfer_in: 'Transfer in',
  withdrawal: 'Withdrawal',
  advance: 'Advance'
};

export const EPF_TX_COLORS: Record<EpfTransactionType, string> = {
  contribution: '#64748b',
  interest: '#10b981',
  transfer_in: '#0ea5e9',
  withdrawal: '#f59e0b',
  advance: '#f59e0b'
};
