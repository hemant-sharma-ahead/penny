import { describe, expect, it } from 'vitest';
import {
  resolveAccounts,
  normalize,
  suggestCardAccountMerges,
  findAmbiguousCardAccountMerges
} from '@/core/import/importAccountResolution';
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

  it('never auto-suggests "skip" (manual-testing gap #1) — it is exclusively a user-initiated action, never a default', () => {
    const result = resolveAccounts([row('HDFC1234'), row('Cash'), row('Some New Wallet')], accounts);
    expect(result.every((r) => r.suggestion.kind !== 'skip')).toBe(true);
  });
});

function cardRow(account: string, bankName: string, accountType: string): ParsedRow {
  return {
    date: 0,
    amount: 1,
    description: 'x',
    categoryName: 'Other',
    type: 'expense',
    hashtags: [],
    account,
    bankName,
    accountType
  };
}

describe('suggestCardAccountMerges', () => {
  it('suggests merging a debit-card row into another resolution sharing its Bank Name', () => {
    const rows = [cardRow('HDFC Bank', 'HDFC Bank', 'bank'), cardRow('HDFC Bank •• 4471', 'HDFC Bank', 'debit-card')];
    const resolutions = resolveAccounts(rows, []);
    const suggestions = suggestCardAccountMerges(rows, resolutions);
    expect(suggestions).toEqual([
      { cardSourceName: 'HDFC Bank •• 4471', targetSourceName: 'HDFC Bank', paymentMode: 'Debit Card' }
    ]);
  });

  it('gives each card on the same bank its OWN independent suggestion (no bulk merge)', () => {
    const rows = [
      cardRow('HDFC Bank', 'HDFC Bank', 'bank'),
      cardRow('HDFC Bank •• 4471', 'HDFC Bank', 'debit-card'),
      cardRow('HDFC Bank •• 9012', 'HDFC Bank', 'credit-card')
    ];
    const resolutions = resolveAccounts(rows, []);
    const suggestions = suggestCardAccountMerges(rows, resolutions);
    expect(suggestions).toHaveLength(2);
    expect(suggestions.find((s) => s.cardSourceName === 'HDFC Bank •• 4471')).toMatchObject({
      targetSourceName: 'HDFC Bank',
      paymentMode: 'Debit Card'
    });
    expect(suggestions.find((s) => s.cardSourceName === 'HDFC Bank •• 9012')).toMatchObject({
      targetSourceName: 'HDFC Bank',
      paymentMode: 'Credit Card'
    });
  });

  it('does not suggest a merge when no other resolution shares the card’s Bank Name', () => {
    const rows = [cardRow('ICICI Bank •• 1111', 'ICICI Bank', 'credit-card')];
    const resolutions = resolveAccounts(rows, []);
    expect(suggestCardAccountMerges(rows, resolutions)).toEqual([]);
  });

  it('does not suggest merging a card into another card row', () => {
    const rows = [
      cardRow('HDFC Bank •• 4471', 'HDFC Bank', 'debit-card'),
      cardRow('HDFC Bank •• 9012', 'HDFC Bank', 'credit-card')
    ];
    const resolutions = resolveAccounts(rows, []);
    expect(suggestCardAccountMerges(rows, resolutions)).toEqual([]);
  });

  it('does not suggest a merge for a plain (non-card) account row', () => {
    const rows = [cardRow('HDFC Bank', 'HDFC Bank', 'bank'), cardRow('ICICI Bank', 'ICICI Bank', 'bank')];
    const resolutions = resolveAccounts(rows, []);
    expect(suggestCardAccountMerges(rows, resolutions)).toEqual([]);
  });
});

describe('findAmbiguousCardAccountMerges (item 70)', () => {
  it('flags a card as ambiguous instead of picking one when 2+ non-card resolutions share its Bank Name', () => {
    const rows = [
      cardRow('SBI Bank A/C', 'SBI', 'bank'),
      cardRow('SBI Bank A/C 2', 'SBI', 'bank'),
      cardRow('SBI Bank A/C •• 9012', 'SBI', 'credit-card')
    ];
    const resolutions = resolveAccounts(rows, []);

    // No confident suggestion for the ambiguous card — this is the actual regression fix.
    expect(suggestCardAccountMerges(rows, resolutions)).toEqual([]);

    const ambiguities = findAmbiguousCardAccountMerges(rows, resolutions);
    expect(ambiguities).toHaveLength(1);
    expect(ambiguities[0]).toMatchObject({ cardSourceName: 'SBI Bank A/C •• 9012', paymentMode: 'Credit Card' });
    expect(new Set(ambiguities[0]?.candidateSourceNames)).toEqual(new Set(['SBI Bank A/C', 'SBI Bank A/C 2']));
  });

  it('scales to 3+ same-bank candidates, listing every one', () => {
    const rows = [
      cardRow('SBI Bank A/C', 'SBI', 'bank'),
      cardRow('SBI Bank A/C 2', 'SBI', 'bank'),
      cardRow('SBI Bank A/C 3', 'SBI', 'bank'),
      cardRow('SBI Bank A/C •• 9012', 'SBI', 'debit-card')
    ];
    const resolutions = resolveAccounts(rows, []);
    const ambiguities = findAmbiguousCardAccountMerges(rows, resolutions);
    expect(ambiguities).toHaveLength(1);
    expect(ambiguities[0]?.candidateSourceNames).toHaveLength(3);
  });

  it('is empty when exactly one non-card resolution shares the bank key (the confident, unambiguous case)', () => {
    const rows = [cardRow('HDFC Bank', 'HDFC Bank', 'bank'), cardRow('HDFC Bank •• 4471', 'HDFC Bank', 'debit-card')];
    const resolutions = resolveAccounts(rows, []);
    expect(findAmbiguousCardAccountMerges(rows, resolutions)).toEqual([]);
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
