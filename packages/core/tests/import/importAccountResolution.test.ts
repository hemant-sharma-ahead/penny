import { describe, expect, it } from 'vitest';
import { resolveAccounts, normalize } from '@/core/import/importAccountResolution';
import type { Account } from '@/core/db/types';
import type { ParsedRow } from '@/core/import/importParsers';

const accounts: Account[] = [
  {
    id: 'acc-1',
    name: 'HDFC1234',
    type: 'bank',
    openingBalance: 0,
    color: '#fff',
    icon: 'ti-wallet',
    includeInNetWorth: true,
    isArchived: false,
    createdAt: 0,
    updatedAt: 0
  }
];

function row(account?: string): ParsedRow {
  return {
    date: 0,
    amount: 1,
    description: 'x',
    categoryName: 'Other',
    type: 'expense',
    hashtags: [],
    ...(account && { account })
  };
}

describe('resolveAccounts', () => {
  it('returns one resolution per distinct account name found in the rows', () => {
    const rows = [row('HDFC1234'), row('HDFC1234'), row('Cash')];
    const result = resolveAccounts(rows, accounts);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.sourceName === 'HDFC1234')?.count).toBe(2);
  });

  it('suggests "existing" for a name matching an account already in the vault', () => {
    const result = resolveAccounts([row('HDFC1234')], accounts);
    expect(result[0]?.suggestion).toMatchObject({ kind: 'existing', accountId: 'acc-1' });
  });

  it('suggests "create" with a sensible inferred type for a new account name', () => {
    const result = resolveAccounts([row('Cash')], accounts);
    expect(result[0]?.suggestion).toMatchObject({ kind: 'create', suggestedType: 'cash' });
  });

  it('returns an empty array when no row carries an account at all (no account column in the file)', () => {
    expect(resolveAccounts([row(), row()], accounts)).toEqual([]);
  });

  it('surfaces fuzzyExistingMatch for a new-looking name that fuzzy-matches a real existing account, without auto-selecting existing', () => {
    const result = resolveAccounts([row('HDFC XX1234')], accounts);
    expect(result[0]?.suggestion.kind).toBe('create');
    expect(result[0]?.fuzzyExistingMatch).toMatchObject({ accountId: 'acc-1', accountName: 'HDFC1234' });
  });

  it('does not set fuzzyExistingMatch when the name has no fuzzy match against existing accounts', () => {
    const result = resolveAccounts([row('Paytm Wallet')], accounts);
    expect(result[0]?.fuzzyExistingMatch).toBeUndefined();
  });

  it('does not set fuzzyExistingMatch for a name that already matched exactly (kind: existing)', () => {
    const result = resolveAccounts([row('HDFC1234')], accounts);
    expect(result[0]?.suggestion.kind).toBe('existing');
    expect(result[0]?.fuzzyExistingMatch).toBeUndefined();
  });
});

describe('normalize', () => {
  it('strips punctuation/whitespace and the masking "x" before trailing digits', () => {
    expect(normalize('HDFC-x1234')).toBe('hdfc1234');
    expect(normalize('HDFC XX1234')).toBe('hdfc1234');
    expect(normalize('HDFC1234')).toBe('hdfc1234');
  });

  it('treats differently-formatted names as equal after normalizing', () => {
    expect(normalize('HDFC_1234')).toBe(normalize('hdfc 1234'));
  });
});
