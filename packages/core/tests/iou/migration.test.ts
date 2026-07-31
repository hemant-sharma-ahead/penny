import { describe, expect, it } from 'vitest';
import { migrateLegacyIous, parsePersonName, UNMATCHED_PERSON_NAME } from '@/core/iou/migration';
import { netBalance } from '@/core/iou/ledger';
import type { PersonalIou } from '@/core/db/types';

const NOW = new Date('2026-06-26T10:00:00').getTime();

const legacy = (over: Partial<PersonalIou>): PersonalIou => ({
  id: Math.random().toString(36).slice(2),
  direction: 'lent',
  amount: 1000,
  description: 'Rohan — dinner',
  date: NOW,
  isSettled: false,
  createdAt: NOW,
  updatedAt: NOW,
  ...over
});

describe('parsePersonName', () => {
  it('takes the leading name before a separator', () => {
    expect(parsePersonName('Rohan — dinner split')).toBe('Rohan');
    expect(parsePersonName('Asha Verma: cab fare')).toBe('Asha Verma');
    expect(parsePersonName('Karthik')).toBe('Karthik');
  });

  it('falls back to Unmatched for sentence-like or numeric descriptions', () => {
    expect(parsePersonName('Borrowed for cab fare when wallet was empty')).toBe(UNMATCHED_PERSON_NAME);
    expect(parsePersonName('Paid ₹500 for groceries')).toBe(UNMATCHED_PERSON_NAME);
    expect(parsePersonName('')).toBe(UNMATCHED_PERSON_NAME);
  });
});

describe('migrateLegacyIous', () => {
  it('dedupes persons by case-insensitive name', () => {
    const { persons } = migrateLegacyIous(
      [legacy({ description: 'Rohan — a' }), legacy({ description: 'rohan — b' })],
      NOW
    );
    expect(persons).toHaveLength(1);
  });

  it('creates one entry per legacy IOU and preserves the original description', () => {
    const { entries } = migrateLegacyIous([legacy({ description: 'Rohan — dinner', amount: 800 })], NOW);
    const base = entries.find((e) => e.kind === 'lent');
    expect(base).toBeDefined();
    expect(base?.amount).toBe(800);
    expect(base?.origin).toBe('migration');
    expect(base?.description).toBe('Rohan — dinner');
  });

  it('reproduces a settled IOU as a net-zero pair', () => {
    const { persons, entries } = migrateLegacyIous(
      [legacy({ description: 'Karthik — tickets', amount: 1500, isSettled: true, settledAt: NOW })],
      NOW
    );
    const personId = persons[0]!.id;
    const personEntries = entries.filter((e) => e.personId === personId);
    expect(personEntries).toHaveLength(2);
    expect(netBalance(personEntries)).toBe(0);
  });

  it('maps a borrowed settlement to you_paid_them', () => {
    const { entries } = migrateLegacyIous(
      [legacy({ direction: 'borrowed', description: 'Asha — loan', amount: 500, isSettled: true })],
      NOW
    );
    const settlement = entries.find((e) => e.kind === 'settlement');
    expect(settlement?.settleDirection).toBe('you_paid_them');
  });
});
