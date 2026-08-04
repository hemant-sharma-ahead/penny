import { describe, expect, it } from 'vitest';
import {
  reconcileGoalLink,
  reconcileLinkedGoalTxn,
  type ExpenseGoalIntent,
  type LinkedGoalTxnIntent
} from '@/core/goals/goalLink';
import type { Expense, GoalContribution } from '@/core/db/types';

const NOW = new Date('2026-08-01T10:00:00').getTime();

const seeded = (over: Partial<GoalContribution>): GoalContribution => ({
  id: 'gc-1',
  goalId: 'goal-1',
  amount: 500,
  date: NOW,
  origin: 'expense',
  linkedTxnId: 'exp-1',
  createdAt: NOW,
  updatedAt: NOW,
  ...over
});

const intent: ExpenseGoalIntent = { goalId: 'goal-1', amount: 1200, date: NOW };

describe('reconcileGoalLink', () => {
  it('creates a new contribution when none exists', () => {
    const { toPut, toDelete } = reconcileGoalLink('exp-1', [], intent, NOW);
    expect(toDelete).toHaveLength(0);
    expect(toPut).toHaveLength(1);
    expect(toPut[0]).toMatchObject({
      goalId: 'goal-1',
      amount: 1200,
      origin: 'expense',
      linkedTxnId: 'exp-1'
    });
  });

  it('updates in place, preserving the existing id and createdAt, when the goal is unchanged', () => {
    const existing = seeded({ id: 'keep', amount: 500, createdAt: 111 });
    const { toPut, toDelete } = reconcileGoalLink('exp-1', [existing], intent, NOW);
    expect(toDelete).toHaveLength(0);
    expect(toPut).toHaveLength(1);
    expect(toPut[0]?.id).toBe('keep');
    expect(toPut[0]?.createdAt).toBe(111);
    expect(toPut[0]?.amount).toBe(1200);
  });

  it('deletes the old contribution and creates a fresh one when the goal changes', () => {
    const existing = seeded({ id: 'old', goalId: 'goal-2', createdAt: 111 });
    const { toPut, toDelete } = reconcileGoalLink('exp-1', [existing], intent, NOW);
    expect(toDelete).toEqual(['old']);
    expect(toPut).toHaveLength(1);
    expect(toPut[0]?.id).not.toBe('old');
    expect(toPut[0]?.goalId).toBe('goal-1');
    expect(toPut[0]?.createdAt).toBe(NOW);
  });

  it('deletes seeded contributions when intent is removed', () => {
    const existing = seeded({ id: 'gone' });
    const { toPut, toDelete } = reconcileGoalLink('exp-1', [existing], null, NOW);
    expect(toPut).toHaveLength(0);
    expect(toDelete).toEqual(['gone']);
  });

  it('ignores contributions from other transactions and deletes duplicate seeds', () => {
    const mine1 = seeded({ id: 'a' });
    const mine2 = seeded({ id: 'b' });
    const other = seeded({ id: 'c', linkedTxnId: 'exp-2' });
    const manual = seeded({ id: 'd', origin: 'manual', linkedTxnId: undefined });
    const { toPut, toDelete } = reconcileGoalLink('exp-1', [mine1, mine2, other, manual], intent, NOW);
    expect(toPut[0]?.id).toBe('a');
    expect(toDelete).toEqual(['b']);
  });
});

// ── Reverse direction: goal contribution → linked account transaction ───────────────────────

const linkedTxn = (over: Partial<Expense>): Expense => ({
  id: 'exp-1',
  amount: 500,
  categoryId: 'cat-savings',
  description: 'Goal contribution',
  date: NOW,
  hashtags: [],
  isRecurring: false,
  type: 'expense',
  accountId: 'acc-1',
  source: 'manual',
  createdAt: 111,
  updatedAt: NOW,
  ...over
});

const txnIntent = (over: Partial<LinkedGoalTxnIntent>): LinkedGoalTxnIntent => ({
  record: true,
  sourceAccountId: 'acc-1',
  amount: 500,
  date: NOW,
  description: 'Goal contribution',
  ...over
});

describe('reconcileLinkedGoalTxn', () => {
  it('creates an expense when there is no destination account', () => {
    const { put, deleteId } = reconcileLinkedGoalTxn(null, txnIntent({ amount: 800 }), NOW);
    expect(deleteId).toBeUndefined();
    expect(put).toMatchObject({
      type: 'expense',
      categoryId: 'cat-savings',
      amount: 800,
      accountId: 'acc-1',
      source: 'manual'
    });
    expect(put?.toAccountId).toBeUndefined();
  });

  it('creates a transfer when a destination account is chosen', () => {
    const { put } = reconcileLinkedGoalTxn(null, txnIntent({ destinationAccountId: 'acc-2' }), NOW);
    expect(put).toMatchObject({
      type: 'transfer',
      categoryId: 'cat-tr-bank',
      accountId: 'acc-1',
      toAccountId: 'acc-2'
    });
  });

  it('updates in place, preserving id and createdAt (reconcile-on-edit)', () => {
    const existing = linkedTxn({ id: 'keep', amount: 500, createdAt: 111 });
    const { put } = reconcileLinkedGoalTxn(existing, txnIntent({ amount: 1200, sourceAccountId: 'acc-3' }), NOW);
    expect(put?.id).toBe('keep');
    expect(put?.createdAt).toBe(111);
    expect(put?.amount).toBe(1200);
    expect(put?.accountId).toBe('acc-3');
    expect(put?.updatedAt).toBe(NOW);
  });

  it('keeps a user-set category while the transaction type is unchanged', () => {
    const existing = linkedTxn({ type: 'expense', categoryId: 'cat-food' });
    const { put } = reconcileLinkedGoalTxn(existing, txnIntent({ amount: 600 }), NOW);
    expect(put?.categoryId).toBe('cat-food');
  });

  it('resets to the default category when expense flips to transfer', () => {
    const existing = linkedTxn({ type: 'expense', categoryId: 'cat-food' });
    const { put } = reconcileLinkedGoalTxn(existing, txnIntent({ destinationAccountId: 'acc-2' }), NOW);
    expect(put?.type).toBe('transfer');
    expect(put?.categoryId).toBe('cat-tr-bank');
  });

  it('deletes the linked transaction when the link is turned off', () => {
    const existing = linkedTxn({ id: 'gone' });
    const { put, deleteId } = reconcileLinkedGoalTxn(existing, txnIntent({ record: false }), NOW);
    expect(put).toBeUndefined();
    expect(deleteId).toBe('gone');
  });

  it('is a no-op when there is nothing to record and nothing linked', () => {
    expect(reconcileLinkedGoalTxn(null, txnIntent({ record: false }), NOW)).toEqual({});
    expect(reconcileLinkedGoalTxn(null, txnIntent({ sourceAccountId: '' }), NOW)).toEqual({});
  });
});
