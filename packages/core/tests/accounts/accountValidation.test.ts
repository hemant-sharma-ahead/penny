import { describe, expect, it } from 'vitest';
import { findDuplicateAccountName } from '@/core/accounts/accountValidation';
import type { Account } from '@/core/db/types';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: crypto.randomUUID(),
    name: 'HDFC Savings',
    type: 'bank',
    openingBalance: 0,
    color: '#fff',
    icon: 'ti-wallet',
    includeInNetWorth: true,
    isArchived: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  };
}

describe('findDuplicateAccountName', () => {
  it('finds a match that differs only by case/whitespace', () => {
    const existing = account({ id: 'acc-1', name: 'HDFC Savings' });
    expect(findDuplicateAccountName('  hdfc savings  ', [existing])).toMatchObject({ id: 'acc-1' });
  });

  it('returns undefined when no account shares the name', () => {
    const existing = account({ id: 'acc-1', name: 'HDFC Savings' });
    expect(findDuplicateAccountName('SBI Current', [existing])).toBeUndefined();
  });

  it('excludes the account being edited via excludeId', () => {
    const existing = account({ id: 'acc-1', name: 'HDFC Savings' });
    expect(findDuplicateAccountName('HDFC Savings', [existing], 'acc-1')).toBeUndefined();
  });

  it('returns undefined for a blank name', () => {
    const existing = account({ id: 'acc-1', name: 'HDFC Savings' });
    expect(findDuplicateAccountName('   ', [existing])).toBeUndefined();
  });
});
