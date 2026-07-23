import type { AccountType } from '@/core/db/types';

export interface AccountMeta {
  label: string;
  icon: string;
  color: string;
}

/** Display order for account types in selectors. */
export const ACCOUNT_TYPES: AccountType[] = ['cash', 'bank', 'credit_card', 'wallet'];

export const ACCOUNT_TYPE_META: Record<AccountType, AccountMeta> = {
  cash: { label: 'Cash', icon: 'ti-cash', color: '#10b981' },
  bank: { label: 'Bank', icon: 'ti-building-bank', color: '#3b82f6' },
  credit_card: { label: 'Credit Card', icon: 'ti-credit-card', color: '#ef4444' },
  wallet: { label: 'Wallet', icon: 'ti-wallet', color: '#8b5cf6' }
};

export function getAccountMeta(type: AccountType): AccountMeta {
  return ACCOUNT_TYPE_META[type];
}
