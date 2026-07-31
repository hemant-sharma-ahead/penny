import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/schema';
import { expensesRepo } from '@/core/db/repositories';
import { deriveKey, generateSalt } from '@/core/crypto/engine';
import { keystore } from '@/core/crypto/keystore';
import { writeImportBatch, undoImportBatch } from '@/core/import/importWriter';
import { applyConfirmedTransferPairs, type ResolvedPreviewRow } from '@/core/import/importPipeline';
import type { TransferPair } from '@/core/import/importTransferPairing';
import { computeBalance } from '@/core/accounts/balanceCalculator';

async function setupKeystore() {
  keystore.setMasterKey(await deriveKey('test-passphrase', generateSalt(), 1_000));
  await db.expenses.clear();
  await db.activity_log.clear();
}

function row(overrides: Partial<ResolvedPreviewRow> = {}): ResolvedPreviewRow {
  return {
    date: 1_700_000_000_000,
    amount: 100,
    description: 'Coffee',
    type: 'expense',
    hashtags: [],
    categoryId: 'cat-food',
    categoryName: 'Dining & Café',
    accountId: 'acc-1',
    skipped: false,
    duplicate: false,
    sourceRef: 'ref-1',
    ...overrides
  };
}

describe('writeImportBatch', () => {
  beforeEach(async () => {
    await setupKeystore();
  });

  it('writes each ready row and returns the count + an activity log id', async () => {
    const result = await writeImportBatch([row(), row({ sourceRef: 'ref-2', description: 'Tea' })]);
    expect(result.succeededCount).toBe(2);
    expect(result.failed).toHaveLength(0);
    expect(result.activityLogId).not.toBeNull();

    const all = await expensesRepo.getAll();
    expect(all.filter((e) => e.source === 'import')).toHaveLength(2);
  });

  it('excludes duplicate and skipped rows from being written', async () => {
    const result = await writeImportBatch([
      row({ duplicate: true }),
      row({ skipped: true, sourceRef: 'ref-3' }),
      row({ sourceRef: 'ref-4' })
    ]);
    expect(result.succeededCount).toBe(1);
    expect(result.activityLogId).not.toBeNull();
  });

  it('returns a null activityLogId when nothing was written', async () => {
    const result = await writeImportBatch([row({ duplicate: true })]);
    expect(result.succeededCount).toBe(0);
    expect(result.activityLogId).toBeNull();
  });
});

describe('writeImportBatch — confirmed transfer pair regression (real balance-accuracy bug)', () => {
  beforeEach(async () => {
    await setupKeystore();
  });

  it('writes a confirmed transfer pair as ONE row, and computeBalance debits one account and credits the other', async () => {
    // The bug: writing both legs of a transfer as independent expense/income rows debited BOTH
    // accounts by `amount` instead of debiting the source and crediting the destination. This test
    // guards against the regression by actually calling computeBalance() after the write, not just
    // asserting row count.
    const outgoing = row({ accountId: 'acc-hdfc', type: 'expense', amount: 5000, sourceRef: 'ref-out' });
    const incoming = row({
      accountId: 'acc-cash',
      type: 'income',
      amount: 5000,
      description: 'Cash withdrawal',
      sourceRef: 'ref-in'
    });
    const pairs: TransferPair[] = [
      { outgoingIndex: 0, incomingIndex: 1, fromAccount: 'HDFC1234', toAccount: 'Cash', amount: 5000, date: outgoing.date }
    ];
    const merged = applyConfirmedTransferPairs([outgoing, incoming], pairs);

    const result = await writeImportBatch(merged);
    expect(result.succeededCount).toBe(1);

    const all = await expensesRepo.getAll();
    const written = all.filter((e) => e.source === 'import');
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ type: 'transfer', accountId: 'acc-hdfc', toAccountId: 'acc-cash', amount: 5000 });

    const hdfcBalance = computeBalance('acc-hdfc', 10_000, written);
    const cashBalance = computeBalance('acc-cash', 10_000, written);
    expect(hdfcBalance).toBe(5_000); // debited
    expect(cashBalance).toBe(15_000); // credited
  });
});

describe('undoImportBatch', () => {
  beforeEach(async () => {
    await setupKeystore();
  });

  it('deletes every expense created by the batch and returns the count', async () => {
    const written = await writeImportBatch([
      row({ sourceRef: 'ref-undo-1' }),
      row({ sourceRef: 'ref-undo-2', description: 'Tea' })
    ]);
    const beforeCount = (await expensesRepo.getAll()).length;
    expect(beforeCount).toBeGreaterThanOrEqual(2);

    const deleted = await undoImportBatch(written.activityLogId!);
    expect(deleted).toBe(2);

    const remaining = await expensesRepo.getAll();
    expect(remaining.filter((e) => e.source === 'import' && e.description === 'Coffee')).toHaveLength(0);
  });

  it('is a no-op the second time (entry already marked restored)', async () => {
    const written = await writeImportBatch([row({ sourceRef: 'ref-undo-3' })]);
    await undoImportBatch(written.activityLogId!);
    const secondCall = await undoImportBatch(written.activityLogId!);
    expect(secondCall).toBe(0);
  });

  it('returns 0 for an unknown activity log id', async () => {
    expect(await undoImportBatch('does-not-exist')).toBe(0);
  });
});
