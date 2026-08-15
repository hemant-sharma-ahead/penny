import { describe, expect, it } from 'vitest';
import { buildSmsAccountMappingKey, resolveSmsAccount } from '@/core/sms-import/smsAccountMatch';
import type { ParsedSmsCandidate } from '@/core/sms-import/smsParser';
import type { Account, SmsAccountMapping } from '@/core/db/types';

function account(overrides: Partial<Account>): Account {
  return {
    id: 'acc-1',
    name: 'My Account',
    type: 'bank',
    openingBalance: 0,
    color: '#000',
    icon: 'ti-wallet',
    includeInNetWorth: true,
    isArchived: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  };
}

function candidate(overrides: Partial<ParsedSmsCandidate>): ParsedSmsCandidate {
  return {
    bankId: 'hdfc',
    transactionType: 'debit',
    direction: 'debit',
    amount: 500,
    date: Date.now(),
    ...overrides
  };
}

describe('resolveSmsAccount', () => {
  it('resolves via an exact Account.last4 + bankId match', () => {
    const a = account({ id: 'acc-hdfc', bankId: 'hdfc', last4: '1234' });
    const result = resolveSmsAccount(candidate({ accountLast4: '1234' }), [a], []);
    expect(result).toEqual({ kind: 'resolved', accountId: 'acc-hdfc' });
  });

  it('resolves via a single non-archived account matching bankId alone (no last4 set)', () => {
    const a = account({ id: 'acc-hdfc', bankId: 'hdfc' });
    const other = account({ id: 'acc-icici', bankId: 'icici' });
    const result = resolveSmsAccount(candidate({}), [a, other], []);
    expect(result).toEqual({ kind: 'resolved', accountId: 'acc-hdfc' });
  });

  it('is ambiguous when multiple non-archived accounts share the same bankId', () => {
    const a1 = account({ id: 'acc-1', bankId: 'hdfc' });
    const a2 = account({ id: 'acc-2', bankId: 'hdfc' });
    const result = resolveSmsAccount(candidate({}), [a1, a2], []);
    expect(result.kind).toBe('ambiguous');
    if (result.kind !== 'ambiguous') return;
    expect(result.candidateAccountIds.sort()).toEqual(['acc-1', 'acc-2']);
  });

  it('excludes archived accounts from bankId/last4 matching', () => {
    const archived = account({ id: 'acc-archived', bankId: 'hdfc', isArchived: true });
    const result = resolveSmsAccount(candidate({}), [archived], []);
    expect(result).toEqual({ kind: 'ambiguous', candidateAccountIds: [] });
  });

  it('falls back to a fuzzy Account.name match when no bankId/last4 signal resolves it', () => {
    const a = account({ id: 'acc-1', name: 'HDFC Bank Savings' }); // no bankId/last4 ever set
    const result = resolveSmsAccount(candidate({}), [a], []);
    expect(result).toEqual({ kind: 'resolved', accountId: 'acc-1' });
  });

  it('a card-last4 mapping wins over everything else, including a conflicting bankId match', () => {
    const wrongGuess = account({ id: 'acc-wrong', bankId: 'hdfc' });
    const mappings: SmsAccountMapping[] = [
      { id: 'm1', kind: 'card_last4', mappingKey: '9988', accountId: 'acc-right', createdAt: 0, updatedAt: 0 }
    ];
    const result = resolveSmsAccount(candidate({ cardLast4: '9988' }), [wrongGuess], mappings);
    expect(result).toEqual({ kind: 'resolved', accountId: 'acc-right' });
  });

  it('a bank_string mapping (bankId+accountLast4) wins over a fresh ambiguous bankId-only guess', () => {
    const a1 = account({ id: 'acc-1', bankId: 'hdfc' });
    const a2 = account({ id: 'acc-2', bankId: 'hdfc' });
    const mappingKey = buildSmsAccountMappingKey(candidate({ accountLast4: '1234' }));
    expect(mappingKey).toEqual({ kind: 'bank_string', mappingKey: 'hdfc:1234' });
    const mappings: SmsAccountMapping[] = [{ id: 'm1', ...mappingKey, accountId: 'acc-2', createdAt: 0, updatedAt: 0 }];
    const result = resolveSmsAccount(candidate({ accountLast4: '1234' }), [a1, a2], mappings);
    expect(result).toEqual({ kind: 'resolved', accountId: 'acc-2' });
  });

  it('is ambiguous with an empty candidate list when nothing at all resolves', () => {
    const unrelated = account({ id: 'acc-1', name: 'Cash Wallet', bankId: 'icici' });
    const result = resolveSmsAccount(candidate({ bankId: 'sbi' }), [unrelated], []);
    expect(result).toEqual({ kind: 'ambiguous', candidateAccountIds: [] });
  });
});

describe('buildSmsAccountMappingKey', () => {
  it('prefers card_last4 when the candidate is a card transaction', () => {
    expect(buildSmsAccountMappingKey(candidate({ cardLast4: '5566' }))).toEqual({
      kind: 'card_last4',
      mappingKey: '5566'
    });
  });

  it('falls back to bank_string with "unknown" when no accountLast4 was captured', () => {
    expect(buildSmsAccountMappingKey(candidate({ bankId: 'sbi' }))).toEqual({
      kind: 'bank_string',
      mappingKey: 'sbi:unknown'
    });
  });
});
