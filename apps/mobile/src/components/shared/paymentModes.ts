import type { Account } from '@/core/db/types';

export type { PaymentMode } from '@/core/db/types';
export { DEFAULT_PAYMENT_MODES, generatePaymentModeId } from '@/core/expenses/paymentModes';

/** A cash account allows only the cash mode; any other account disallows cash. */
export function isPaymentModeDisabled(account: Account | undefined, modeId: string): boolean {
  if (!account) return false;
  if (account.type === 'cash') return modeId !== 'cash';
  return modeId === 'cash';
}

/** The payment-mode side of the account↔payment coupling, given a newly chosen account. */
export function couplePaymentToAccount(account: Account | undefined, currentMode: string): string {
  if (account?.type === 'cash') return 'cash';
  if (currentMode === 'cash') return '';
  return currentMode;
}

/** The payment mode a brand-new transaction should start with, purely from its default account's
 *  type (2026-08-27, no separate "default payment mode" setting) — cash accounts already forced
 *  'cash' via `couplePaymentToAccount` above; this adds a real starting guess for the other two
 *  types instead of leaving them blank. Ids match `DEFAULT_PAYMENT_MODES`
 *  (`core/expenses/paymentModes.ts`) — 'cash'/'upi'/'card' are all seeded defaults, never disabled
 *  for their respective account type by `isPaymentModeDisabled` above. */
export function defaultPaymentModeForAccount(account: Pick<Account, 'type'> | undefined): string {
  if (!account) return '';
  if (account.type === 'cash') return 'cash';
  if (account.type === 'credit_card') return 'card';
  return 'upi'; // bank, wallet
}
