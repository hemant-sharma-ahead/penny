import type { Account } from '@/core/db/types';

export interface PaymentMode {
  id: string;
  label: string;
  icon: string;
  color: string;
}

export const PAYMENT_MODES: PaymentMode[] = [
  { id: 'cash', label: 'Cash', icon: 'ti-cash', color: '#22c55e' },
  { id: 'upi', label: 'UPI', icon: 'ti-qrcode', color: '#7c3aed' },
  { id: 'card', label: 'Card', icon: 'ti-credit-card', color: '#3b82f6' },
  { id: 'net', label: 'Net', icon: 'ti-building-bank', color: '#0ea5e9' },
  { id: 'wallet', label: 'Wallet', icon: 'ti-wallet', color: '#f97316' }
];

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
