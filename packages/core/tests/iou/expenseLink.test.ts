import { describe, expect, it } from 'vitest';
import {
  reconcileExpenseLink,
  reconcileLinkedTxn,
  type ExpenseIouIntent,
  type LinkedTxnIntent
} from '@/core/iou/expenseLink';
import type { Expense, LedgerEntry } from '@/core/db/types';

const NOW = new Date('2026-06-26T10:00:00').getTime();

const seeded = (over: Partial<LedgerEntry>): LedgerEntry => ({
  id: 'le-1',
  personId: 'p1',
  kind: 'lent',
  amount: 500,
  date: NOW,
  origin: 'expense',
  linkedTxnId: 'exp-1',
  createdAt: NOW,
  updatedAt: NOW,
  ...over
});

const intent: ExpenseIouIntent = { personId: 'p1', kind: 'lent', amount: 1200, date: NOW, description: 'Dinner' };

describe('reconcileExpenseLink', () => {
  it('creates a new entry when none exists', () => {
    const { toPut, toDelete } = reconcileExpenseLink('exp-1', [], intent, NOW);
    expect(toDelete).toHaveLength(0);
    expect(toPut).toHaveLength(1);
    expect(toPut[0]).toMatchObject({
      personId: 'p1',
      kind: 'lent',
      amount: 1200,
      origin: 'expense',
      linkedTxnId: 'exp-1',
      description: 'Dinner'
    });
  });

  it('updates in place, preserving the existing id and createdAt', () => {
    const existing = seeded({ id: 'keep', amount: 500, createdAt: 111 });
    const { toPut, toDelete } = reconcileExpenseLink('exp-1', [existing], intent, NOW);
    expect(toDelete).toHaveLength(0);
    expect(toPut).toHaveLength(1);
    expect(toPut[0]?.id).toBe('keep');
    expect(toPut[0]?.createdAt).toBe(111);
    expect(toPut[0]?.amount).toBe(1200);
  });

  it('deletes seeded entries when intent is removed', () => {
    const existing = seeded({ id: 'gone' });
    const { toPut, toDelete } = reconcileExpenseLink('exp-1', [existing], null, NOW);
    expect(toPut).toHaveLength(0);
    expect(toDelete).toEqual(['gone']);
  });

  it('ignores entries from other expenses and deletes duplicate seeds', () => {
    const mine1 = seeded({ id: 'a' });
    const mine2 = seeded({ id: 'b' });
    const other = seeded({ id: 'c', linkedTxnId: 'exp-2' });
    const manual = seeded({ id: 'd', origin: 'manual', linkedTxnId: undefined });
    const { toPut, toDelete } = reconcileExpenseLink('exp-1', [mine1, mine2, other, manual], intent, NOW);
    expect(toPut[0]?.id).toBe('a');
    expect(toDelete).toEqual(['b']);
  });
});

// ── Reverse direction: IOU entry / settlement → linked account transaction ──────────────────

const linkedTxn = (over: Partial<Expense>): Expense => ({
  id: 'exp-1',
  amount: 500,
  categoryId: 'cat-other',
  description: 'Lent to Rohan',
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

const txnIntent = (over: Partial<LinkedTxnIntent>): LinkedTxnIntent => ({
  record: true,
  accountId: 'acc-1',
  amount: 500,
  date: NOW,
  moneyIn: false,
  description: 'Lent to Rohan',
  ...over
});

describe('reconcileLinkedTxn', () => {
  it('creates an expense for money out (lent / you paid them)', () => {
    const { put, deleteId } = reconcileLinkedTxn(null, txnIntent({ moneyIn: false, amount: 800 }), NOW);
    expect(deleteId).toBeUndefined();
    expect(put).toMatchObject({
      type: 'expense',
      categoryId: 'cat-other',
      amount: 800,
      accountId: 'acc-1',
      source: 'manual'
    });
  });

  it('creates an income for money in (borrowed / they paid you) — settle→txn direction', () => {
    const { put } = reconcileLinkedTxn(
      null,
      txnIntent({ moneyIn: true, amount: 300, description: 'Settlement from Asha' }),
      NOW
    );
    expect(put).toMatchObject({
      type: 'income',
      categoryId: 'cat-inc-other',
      amount: 300,
      description: 'Settlement from Asha'
    });
  });

  it('updates in place, preserving id and createdAt (reconcile-on-edit)', () => {
    const existing = linkedTxn({ id: 'keep', amount: 500, createdAt: 111 });
    const { put } = reconcileLinkedTxn(existing, txnIntent({ amount: 1200, accountId: 'acc-2' }), NOW);
    expect(put?.id).toBe('keep');
    expect(put?.createdAt).toBe(111);
    expect(put?.amount).toBe(1200);
    expect(put?.accountId).toBe('acc-2');
    expect(put?.updatedAt).toBe(NOW);
  });

  it('keeps a user-set category while the money direction is unchanged', () => {
    const existing = linkedTxn({ type: 'expense', categoryId: 'cat-food' });
    const { put } = reconcileLinkedTxn(existing, txnIntent({ moneyIn: false, amount: 600 }), NOW);
    expect(put?.categoryId).toBe('cat-food');
  });

  it('resets to the default category when the direction flips (lent → borrowed)', () => {
    const existing = linkedTxn({ type: 'expense', categoryId: 'cat-food' });
    const { put } = reconcileLinkedTxn(existing, txnIntent({ moneyIn: true }), NOW);
    expect(put?.type).toBe('income');
    expect(put?.categoryId).toBe('cat-inc-other');
  });

  it('deletes the linked transaction when the link is turned off', () => {
    const existing = linkedTxn({ id: 'gone' });
    const { put, deleteId } = reconcileLinkedTxn(existing, txnIntent({ record: false }), NOW);
    expect(put).toBeUndefined();
    expect(deleteId).toBe('gone');
  });

  it('is a no-op when there is nothing to record and nothing linked', () => {
    expect(reconcileLinkedTxn(null, txnIntent({ record: false }), NOW)).toEqual({});
    expect(reconcileLinkedTxn(null, txnIntent({ accountId: '' }), NOW)).toEqual({});
  });
});
