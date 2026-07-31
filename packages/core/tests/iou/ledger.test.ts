import { describe, expect, it } from 'vitest';
import {
  balanceByPerson,
  isSettled,
  netBalance,
  overdueEntries,
  signedAmount,
  totalOwedToYou,
  totalYouOwe
} from '@/core/iou/ledger';
import type { LedgerEntry } from '@/core/db/types';

const DAY = 86_400_000;
const NOW = new Date('2026-06-26T10:00:00').getTime();

const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
  id: Math.random().toString(36).slice(2),
  personId: 'p1',
  kind: 'lent',
  amount: 100,
  date: NOW,
  origin: 'manual',
  createdAt: NOW,
  updatedAt: NOW,
  ...over
});

describe('signedAmount', () => {
  it('lent is positive, borrowed is negative', () => {
    expect(signedAmount(entry({ kind: 'lent', amount: 100 }))).toBe(100);
    expect(signedAmount(entry({ kind: 'borrowed', amount: 100 }))).toBe(-100);
  });

  it('settlement sign depends on direction', () => {
    expect(signedAmount(entry({ kind: 'settlement', amount: 50, settleDirection: 'they_paid_you' }))).toBe(-50);
    expect(signedAmount(entry({ kind: 'settlement', amount: 50, settleDirection: 'you_paid_them' }))).toBe(50);
  });
});

describe('netBalance', () => {
  it('a lend reduced by a partial repayment', () => {
    const entries = [
      entry({ kind: 'lent', amount: 1000 }),
      entry({ kind: 'settlement', amount: 400, settleDirection: 'they_paid_you' })
    ];
    expect(netBalance(entries)).toBe(600);
  });

  it('over-settlement flips the sign (never clamped)', () => {
    const entries = [
      entry({ kind: 'lent', amount: 100 }),
      entry({ kind: 'settlement', amount: 150, settleDirection: 'they_paid_you' })
    ];
    expect(netBalance(entries)).toBe(-50);
  });

  it('empty ledger is zero', () => {
    expect(netBalance([])).toBe(0);
  });
});

describe('balanceByPerson + totals', () => {
  const entries = [
    entry({ personId: 'a', kind: 'lent', amount: 700 }),
    entry({ personId: 'b', kind: 'borrowed', amount: 250 }),
    entry({ personId: 'c', kind: 'lent', amount: 100 }),
    entry({ personId: 'c', kind: 'settlement', amount: 100, settleDirection: 'they_paid_you' })
  ];
  const balances = balanceByPerson(entries);

  it('computes per-person nets', () => {
    expect(balances.get('a')).toBe(700);
    expect(balances.get('b')).toBe(-250);
    expect(balances.get('c')).toBe(0);
  });

  it('totals split positives and negatives (settled person c contributes nothing)', () => {
    expect(totalOwedToYou(balances)).toBe(700);
    expect(totalYouOwe(balances)).toBe(250);
  });
});

describe('isSettled', () => {
  it('treats sub-rupee residue as settled', () => {
    expect(isSettled(0)).toBe(true);
    expect(isSettled(0.4)).toBe(true);
    expect(isSettled(-0.99)).toBe(true);
    expect(isSettled(1)).toBe(false);
    expect(isSettled(-5)).toBe(false);
  });
});

describe('net IOU (net-worth contribution)', () => {
  // useHome folds the whole-ledger net into net worth: positive = a receivable asset,
  // negative = a payable that increases liabilities. This is netBalance over every entry.
  it('is the signed sum across all people and settlements', () => {
    const entries = [
      entry({ personId: 'a', kind: 'lent', amount: 1000 }),
      entry({ personId: 'a', kind: 'settlement', amount: 400, settleDirection: 'they_paid_you' }), // a now owes 600
      entry({ personId: 'b', kind: 'borrowed', amount: 250 }) // you owe b 250
    ];
    const netIou = netBalance(entries);
    expect(netIou).toBe(350); // 600 receivable − 250 payable
    expect(Math.max(0, netIou)).toBe(350); // asset side
    expect(Math.max(0, -netIou)).toBe(0); // liability side
  });

  it('a net payable surfaces on the liability side', () => {
    const entries = [
      entry({ personId: 'a', kind: 'lent', amount: 100 }),
      entry({ personId: 'b', kind: 'borrowed', amount: 900 })
    ];
    const netIou = netBalance(entries);
    expect(netIou).toBe(-800);
    expect(Math.max(0, -netIou)).toBe(800);
  });
});

describe('overdueEntries', () => {
  it('returns only non-settlement entries past their due date', () => {
    const entries = [
      entry({ kind: 'lent', amount: 100, dueDate: NOW - DAY }),
      entry({ kind: 'lent', amount: 100, dueDate: NOW + DAY }),
      entry({ kind: 'lent', amount: 100 }),
      entry({ kind: 'settlement', amount: 100, settleDirection: 'they_paid_you', dueDate: NOW - DAY })
    ];
    expect(overdueEntries(entries, NOW)).toHaveLength(1);
  });
});
