import type { Account } from '@/core/db/types';

/**
 * At most one account across the whole set may have `isDefault: true` (2026-08-27) — pre-selects
 * that account (and its type-appropriate payment mode, via `defaultPaymentModeForAccount()`) on
 * every new expense/income. Every `saveAccount` implementation in the app (`features/accounts/
useAccounts.ts`'s real one, plus `ExpenseForm.tsx`'s and `IouView.tsx`'s inline "+ Add account"
 * ones — three independent implementations, since a feature module can't import another's hook)
 * must call this the same way, or a save that sets `isDefault: true` from one of the inline paths
 * could leave two accounts defaulted at once instead of swapping.
 *
 * Returns the OTHER account that needs `isDefault: false` written alongside `record` — the caller's
 * own confirm-before-save step (`useAccountForm.ts`'s `pendingDefaultSwap`) is what actually asks the
 * user first; this is purely "which record (if any) needs the follow-up write," not the UI gate.
 */
export function findPreviousDefaultAccount(
  accounts: Account[],
  record: Pick<Account, 'id' | 'isDefault'>
): Account | undefined {
  if (!record.isDefault) return undefined;
  return accounts.find((a) => a.isDefault && a.id !== record.id);
}
