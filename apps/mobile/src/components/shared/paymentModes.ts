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
